"""Fabric rolls: create, capture along the roll, score with the four-point system, report."""

import json
import re
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from sqlmodel import Session, col, delete, select

from texscan.api import storage
from texscan.api.common import ApiError, decode_bytes, get_profile_or_404, resolve_config
from texscan.api.roll_schemas import CaptureResult, RollIn, RollListItem, RollOut, RollPatch, RollStats, RollStatus
from texscan.api.rolls_service import load_captures, roll_list_item, roll_out, roll_stats
from texscan.api.schemas import RejectedFile
from texscan.api.service import store_result
from texscan.db import get_session
from texscan.models import Inspection, Profile, Roll, RollCapture
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.measure import mm_per_working_pixel
from texscan.profiles import profile_config
from texscan.report.roll import RollReportData, roll_report

router = APIRouter(prefix="/rolls", tags=["rolls"])
MAX_CAPTURES_PER_REQUEST = 100
PDF = {200: {"content": {"application/pdf": {}}, "description": "The roll report as a PDF file"}}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_roll_or_404(session: Session, roll_id: int) -> Roll:
    roll = session.get(Roll, roll_id)
    if roll is None:
        raise ApiError(404, f"no roll with id {roll_id}")
    return roll


def _calibrated_config(session: Session, profile_id: int | None) -> tuple[Profile, PipelineConfig]:
    if profile_id is None:
        raise ApiError(422, "this roll has no profile")
    profile = session.get(Profile, profile_id)
    if profile is None:
        raise ApiError(422, "the roll's profile no longer exists")
    config = profile_config(profile)
    if config.calibration is None:
        raise ApiError(422, f"profile '{profile.name}' has no size calibration. Defects cannot be scored in inches without one: calibrate it on the Profiles page.")
    return profile, config


@router.post("", response_model=RollOut, status_code=201)
def create_roll(body: RollIn, session: Session = Depends(get_session)) -> RollOut:
    """Start a roll. Its profile must be size-calibrated, because points depend on real defect lengths."""
    code = body.code.strip()
    if not code:
        raise ApiError(422, "the roll ID is empty")
    get_profile_or_404(session, body.profile_id)
    _calibrated_config(session, body.profile_id)
    if session.exec(select(Roll).where(Roll.code == code)).first() is not None:
        raise ApiError(409, f"a roll with ID '{code}' already exists")
    roll = Roll(**{**body.model_dump(), "code": code})
    session.add(roll)
    session.commit()
    session.refresh(roll)
    return roll_out(session, roll)


@router.get("", response_model=list[RollListItem])
def list_rolls(
    status: Annotated[RollStatus | None, Query()] = None,
    q: Annotated[str | None, Query(description="matches roll ID, supplier or fabric")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    session: Session = Depends(get_session),
) -> list[RollListItem]:
    query = select(Roll).order_by(col(Roll.created_at).desc(), col(Roll.id).desc()).limit(limit)
    if status:
        query = query.where(Roll.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(col(Roll.code).like(like) | col(Roll.supplier).like(like) | col(Roll.fabric).like(like))
    return [roll_list_item(session, r) for r in session.exec(query)]


@router.get("/stats", response_model=RollStats)
def get_roll_stats(session: Session = Depends(get_session)) -> RollStats:
    """Roll KPIs for the dashboard: rolls inspected, acceptance rate, average points, defect types by supplier."""
    return roll_stats(session)


@router.get("/{roll_id}", response_model=RollOut)
def get_roll(roll_id: int, session: Session = Depends(get_session)) -> RollOut:
    return roll_out(session, get_roll_or_404(session, roll_id))


@router.patch("/{roll_id}", response_model=RollOut)
def update_roll(roll_id: int, body: RollPatch, session: Session = Depends(get_session)) -> RollOut:
    """Edit the details, the limit or the hole rule, or mark the roll complete (or open it again)."""
    roll = get_roll_or_404(session, roll_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    status = changes.pop("status", None)
    for name, value in changes.items():
        setattr(roll, name, value)
    if status is not None and status != roll.status:
        roll.status = status
        roll.completed_at = _now() if status == "complete" else None
    roll.updated_at = _now()
    session.add(roll)
    session.commit()
    session.refresh(roll)
    return roll_out(session, roll)


def _drop_inspection(session: Session, inspection_id: int) -> None:
    row = session.get(Inspection, inspection_id)
    if row is not None:
        session.delete(row)
    storage.delete_images(inspection_id)


@router.delete("/{roll_id}", status_code=204)
def delete_roll(roll_id: int, session: Session = Depends(get_session)) -> Response:
    """Delete the roll with its captures and their inspections."""
    roll = get_roll_or_404(session, roll_id)
    captures, _ = load_captures(session, roll_id)
    for capture in captures:
        _drop_inspection(session, capture.inspection_id)
    session.exec(delete(RollCapture).where(col(RollCapture.roll_id) == roll_id))
    session.delete(roll)
    session.commit()
    return Response(status_code=204)


def _parse_positions(raw: str, count: int, length_m: float) -> list[float]:
    try:
        values = json.loads(raw)
    except ValueError as exc:
        raise ApiError(422, "positions must be a JSON list of numbers, one metre mark per image") from exc
    if not isinstance(values, list) or len(values) != count or not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
        raise ApiError(422, f"send one metre mark per image: {count} image(s) need a list of {count} number(s)")
    bad = [v for v in values if not 0 <= v <= length_m]
    if bad:
        raise ApiError(422, f"metre marks must be between 0 and the roll length ({length_m:g} m); got {bad[0]:g}")
    return [float(v) for v in values]


@router.post("/{roll_id}/captures", response_model=CaptureResult, status_code=201)
def add_captures(
    roll_id: int,
    images: Annotated[list[UploadFile], File(description="Pictures of the fabric, one per position")],
    positions: Annotated[str, Form(description="JSON list of metre marks (the picture's top edge), one per image")],
    config: Annotated[str | None, Form(description="JSON PipelineConfig overrides, e.g. from live capture")] = None,
    session: Session = Depends(get_session),
) -> CaptureResult:
    """Inspect each picture with the roll's profile and place it on the roll at its metre mark."""
    roll = get_roll_or_404(session, roll_id)
    if roll.status == "complete":
        raise ApiError(409, "this roll is marked complete. Open it again to add captures.")
    if not 1 <= len(images) <= MAX_CAPTURES_PER_REQUEST:
        raise ApiError(422, f"send between 1 and {MAX_CAPTURES_PER_REQUEST} images, got {len(images)}")
    marks = _parse_positions(positions, len(images), roll.length_m)
    _calibrated_config(session, roll.profile_id)
    cfg = resolve_config(session, roll.profile_id, None, config)
    calibration = cfg.calibration
    assert calibration is not None
    vertical = roll.along == "vertical"

    rejected: list[RejectedFile] = []
    added = 0
    for upload, mark in zip(images, marks):
        name = upload.filename or "upload"
        try:
            image = decode_bytes(upload.file.read(), name)
        except ApiError as exc:
            rejected.append(RejectedFile(filename=name, reason=str(exc.detail)))
            continue
        result = run_pipeline(image, cfg)
        x0, y0, x1, y1 = result.crop
        crop_shape = (y1 - y0, x1 - x0) if result.crop != (0, 0, 0, 0) else image.shape[:2]
        gray_shape = result.stages["gray"].shape
        per_working_px = mm_per_working_pixel(calibration, image.shape, crop_shape, gray_shape)
        per_original_px = per_working_px * max(gray_shape) / max(crop_shape)
        covered_m = (gray_shape[0] if vertical else gray_shape[1]) * per_working_px / 1000.0
        crop_offset_m = ((y0 if vertical else x0) if result.crop != (0, 0, 0, 0) else 0) * per_original_px / 1000.0
        row = store_result(session, image, name, cfg, roll.profile_id, result)
        assert row.id is not None
        session.add(RollCapture(roll_id=roll_id, inspection_id=row.id, position_m=mark, start_m=mark + crop_offset_m, covered_m=covered_m))
        session.commit()
        added += 1
    if added == 0:
        raise ApiError(422, "none of the files could be read: " + "; ".join(r.reason for r in rejected))
    roll.updated_at = _now()
    session.add(roll)
    session.commit()
    session.refresh(roll)
    return CaptureResult(roll=roll_out(session, roll), added=added, rejected=rejected)


@router.delete("/{roll_id}/captures/{capture_id}", response_model=RollOut)
def delete_capture(roll_id: int, capture_id: int, session: Session = Depends(get_session)) -> RollOut:
    """Remove one capture (and its inspection) from the roll."""
    roll = get_roll_or_404(session, roll_id)
    capture = session.get(RollCapture, capture_id)
    if capture is None or capture.roll_id != roll_id:
        raise ApiError(404, f"roll {roll_id} has no capture {capture_id}")
    inspection_id = capture.inspection_id
    session.delete(capture)
    _drop_inspection(session, inspection_id)
    roll.updated_at = _now()
    session.add(roll)
    session.commit()
    session.refresh(roll)
    return roll_out(session, roll)


@router.get("/{roll_id}/report.pdf", responses=PDF, response_class=Response)
def roll_pdf(roll_id: int, session: Session = Depends(get_session)) -> Response:
    """The roll's inspection record: details, score and grade, defect map, defect list, signature lines."""
    roll = get_roll_or_404(session, roll_id)
    content = roll_report(RollReportData(roll=roll_out(session, roll)))
    safe = re.sub(r"[^\w.-]+", "_", roll.code)[:50] or str(roll_id)
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="texscan-roll-{safe}.pdf"'})
