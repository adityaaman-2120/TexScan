import json
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response
from sqlmodel import Session, col, select

from texscan.api import storage
from texscan.api.common import ApiError
from texscan.api.service import inspection_out
from texscan.db import get_session
from texscan.models import Inspection, Profile
from texscan.report import BatchItem, BatchReportData, InspectionReportData, batch_report, inspection_report

router = APIRouter(tags=["reports"])
PDF = {200: {"content": {"application/pdf": {}}, "description": "The report as a PDF file"}}


def _pdf(content: bytes, filename: str) -> Response:
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def _profile_name(session: Session, profile_id: int | None) -> str | None:
    profile = session.get(Profile, profile_id) if profile_id is not None else None
    return profile.name if profile else None


def _png(inspection_id: int, name: str) -> bytes | None:
    path = storage.file_path(inspection_id, f"{name}.png")
    return path.read_bytes() if path else None


@router.get("/inspections/{inspection_id}/report.pdf", responses=PDF, response_class=Response)
def inspection_pdf(inspection_id: int, session: Session = Depends(get_session)) -> Response:
    """A printable report of one inspection: verdict, images, defects, pipeline stages, settings and timings."""
    row = session.get(Inspection, inspection_id)
    if row is None:
        raise ApiError(404, f"no inspection with id {inspection_id}")
    out = inspection_out(row)
    images = {name: png for name in out.stage_urls if (png := _png(inspection_id, name))}
    data = InspectionReportData(inspection=out, profile_name=_profile_name(session, row.profile_id), images=images)
    return _pdf(inspection_report(data), f"texscan-inspection-{inspection_id}.pdf")


@router.get("/batches/{batch_id}/report.pdf", responses=PDF, response_class=Response)
def batch_pdf(batch_id: Annotated[str, Path(max_length=64)], session: Session = Depends(get_session)) -> Response:
    """A printable report of every inspection that belongs to a batch (works after a restart: it reads the stored results)."""
    rows = session.exec(select(Inspection).where(Inspection.batch_id == batch_id).order_by(col(Inspection.id))).all()
    if not rows:
        raise ApiError(404, f"no inspections for batch {batch_id}")
    items = [
        BatchItem(
            inspection_id=r.id or 0, filename=r.filename, decision=r.decision, defect_count=r.defect_count, defect_area_percent=r.defect_area_percent,
            total_ms=sum(json.loads(r.timings_json).values()), types=json.loads(r.type_counts_json),
            overlay_png=_png(r.id or 0, "overlay") if r.decision == "FAIL" else None,
        )
        for r in rows
    ]  # fmt: skip
    methods = {r.method for r in rows}
    data = BatchReportData(
        batch_id=batch_id, items=items, method=methods.pop() if len(methods) == 1 else "mixed",
        profile_name=_profile_name(session, rows[0].profile_id), started=min(r.created_at for r in rows), finished=max(r.created_at for r in rows),
    )  # fmt: skip
    return _pdf(batch_report(data), f"texscan-batch-{batch_id[:8]}.pdf")
