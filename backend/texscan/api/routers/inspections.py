from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session, col, func, select

from texscan.api import storage
from texscan.api.common import ApiError, to_data_uri
from texscan.api.schemas import BitPlane, BitPlanesOut, InspectionOut, InspectionPage
from texscan.api.service import inspection_out, inspection_summary
from texscan.db import get_session
from texscan.imageio import read_image
from texscan.models import Inspection
from texscan.pipeline.bitplanes import bit_planes

router = APIRouter(prefix="/inspections", tags=["inspections"])


@router.get("", response_model=InspectionPage)
def list_inspections(
    decision: Annotated[Literal["PASS", "FAIL"] | None, Query()] = None,
    profile_id: Annotated[int | None, Query()] = None,
    method: Annotated[str | None, Query(description="exact method name")] = None,
    q: Annotated[str | None, Query(max_length=200, description="case-insensitive filename search")] = None,
    batch_id: Annotated[str | None, Query()] = None,
    date_from: Annotated[date | None, Query(description="inclusive, YYYY-MM-DD (UTC)")] = None,
    date_to: Annotated[date | None, Query(description="inclusive, YYYY-MM-DD (UTC)")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    session: Session = Depends(get_session),
) -> InspectionPage:
    """Newest first. Filters combine with AND."""
    conditions = []
    if decision:
        conditions.append(Inspection.decision == decision)
    if profile_id is not None:
        conditions.append(Inspection.profile_id == profile_id)
    if method:
        conditions.append(Inspection.method == method)
    if q:
        conditions.append(func.lower(col(Inspection.filename)).contains(q.lower(), autoescape=True))
    if batch_id:
        conditions.append(Inspection.batch_id == batch_id)
    if date_from:
        conditions.append(Inspection.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        conditions.append(Inspection.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc))
    total = session.exec(select(func.count()).select_from(Inspection).where(*conditions)).one()
    rows = session.exec(
        select(Inspection)
        .where(*conditions)
        .order_by(col(Inspection.created_at).desc(), col(Inspection.id).desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return InspectionPage(items=[inspection_summary(r) for r in rows], total=total, limit=limit, offset=offset)


def _get_or_404(session: Session, inspection_id: int) -> Inspection:
    row = session.get(Inspection, inspection_id)
    if row is None:
        raise ApiError(404, f"no inspection with id {inspection_id}")
    return row


@router.get("/{inspection_id}", response_model=InspectionOut)
def get_inspection(inspection_id: int, session: Session = Depends(get_session)) -> InspectionOut:
    return inspection_out(_get_or_404(session, inspection_id))


@router.get("/{inspection_id}/bit-planes", response_model=BitPlanesOut)
def get_bit_planes(inspection_id: int, session: Session = Depends(get_session)) -> BitPlanesOut:
    """The eight bit planes of the inspection's grayscale image, most significant first (a syllabus view, not used by detection)."""
    _get_or_404(session, inspection_id)
    path = storage.file_path(inspection_id, "gray.png")
    if path is None:
        raise ApiError(404, f"inspection {inspection_id} has no grayscale image on disk")
    gray = read_image(path)[:, :, 0]  # stored as an 8-bit single-channel PNG; decoding replicates it into 3 equal channels
    planes = bit_planes(gray)
    height, width = gray.shape
    labels = {7: "Bit 7 (MSB)", 0: "Bit 0 (LSB)"}
    return BitPlanesOut(
        inspection_id=inspection_id,
        width=width,
        height=height,
        planes=[BitPlane(bit=k, label=labels.get(k, f"Bit {k}"), ones_percent=float((planes[k] > 0).mean() * 100), image=to_data_uri(planes[k])) for k in range(7, -1, -1)],
    )


@router.delete("/{inspection_id}", status_code=204)
def delete_inspection(inspection_id: int, session: Session = Depends(get_session)) -> Response:
    row = _get_or_404(session, inspection_id)
    session.delete(row)
    session.commit()
    storage.delete_images(inspection_id)
    return Response(status_code=204)
