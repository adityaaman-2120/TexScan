"""Real-world size calibration of a profile, and the printable marker."""

import math
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from pydantic import BaseModel
from sqlmodel import Session

from texscan.api.common import ApiError, get_profile_or_404, read_upload
from texscan.api.routers.profiles import profile_out
from texscan.api.schemas import ProfileOut
from texscan.db import get_session
from texscan.pipeline.load import to_gray
from texscan.pipeline.measure import detect_markers, marker_side_px, scale_from_marker, scale_from_points
from texscan.pipeline.types import Calibration
from texscan.profiles import set_calibration
from texscan.report.marker import MAX_SIDE_MM, MIN_SIDE_MM, marker_pdf

router = APIRouter(tags=["calibration"])
PDF = {200: {"content": {"application/pdf": {}}, "description": "The marker as a PDF file"}}


class CalibrationOut(BaseModel):
    profile: ProfileOut
    mm_per_pixel: float
    detail: str  # what was measured, in words


@router.post("/profiles/{profile_id}/calibration/marker", response_model=CalibrationOut)
def calibrate_with_marker(
    profile_id: int,
    image: Annotated[UploadFile, File(description="A photo with the printed marker in view")],
    side_mm: Annotated[float, Form(gt=0, le=1000, description="Printed side length of the marker's black square, in mm")],
    session: Session = Depends(get_session),
) -> CalibrationOut:
    """Find the printed ArUco marker in the photo and store mm per pixel in the profile."""
    profile = get_profile_or_404(session, profile_id)
    decoded = read_upload(image)
    markers = detect_markers(to_gray(decoded))
    if not markers:
        raise ApiError(422, "No calibration marker was found in that photo. Print the marker from this page, keep it flat, sharp and fully in view, and try again.")
    _, corners = markers[0]
    scale = scale_from_marker(corners, side_mm)
    calibration = Calibration(mm_per_pixel=scale, image_long_side=max(decoded.shape[:2]), source="marker", reference_mm=side_mm)
    detail = f"Marker found: {marker_side_px(corners):.1f} px wide for {side_mm:g} mm"
    return CalibrationOut(profile=profile_out(set_calibration(session, profile, calibration)), mm_per_pixel=scale, detail=detail)


@router.post("/profiles/{profile_id}/calibration/ruler", response_model=CalibrationOut)
def calibrate_with_ruler(
    profile_id: int,
    image_width: Annotated[int, Form(ge=2, description="Width of the photo the points were picked on, in pixels")],
    image_height: Annotated[int, Form(ge=2)],
    x1: Annotated[float, Form()],
    y1: Annotated[float, Form()],
    x2: Annotated[float, Form()],
    y2: Annotated[float, Form()],
    distance_mm: Annotated[float, Form(gt=0, le=100_000, description="Real distance between the two points, in mm")],
    session: Session = Depends(get_session),
) -> CalibrationOut:
    """Two points clicked on a ruler (or any known length) in a photo, with the distance between them."""
    profile = get_profile_or_404(session, profile_id)
    inside = all(0 <= x <= image_width and 0 <= y <= image_height for x, y in ((x1, y1), (x2, y2)))
    if not inside:
        raise ApiError(422, "Both points must lie inside the photo")
    pixels = math.dist((x1, y1), (x2, y2))
    if pixels < 5:
        raise ApiError(422, "The two points are too close together; pick the two ends of the ruler")
    scale = scale_from_points((x1, y1), (x2, y2), distance_mm)
    calibration = Calibration(mm_per_pixel=scale, image_long_side=max(image_width, image_height), source="ruler", reference_mm=distance_mm)
    return CalibrationOut(
        profile=profile_out(set_calibration(session, profile, calibration)),
        mm_per_pixel=scale,
        detail=f"{pixels:.1f} px for {distance_mm:g} mm",
    )


@router.delete("/profiles/{profile_id}/calibration", response_model=ProfileOut)
def clear_calibration(profile_id: int, session: Session = Depends(get_session)) -> ProfileOut:
    """Back to sizes in pixels only."""
    return profile_out(set_calibration(session, get_profile_or_404(session, profile_id), None))


@router.get("/calibration/marker.pdf", responses=PDF, response_class=Response)
def marker_pdf_download(
    side_mm: Annotated[float, Query(ge=MIN_SIDE_MM, le=MAX_SIDE_MM, description="Side of the printed black square, in mm")] = 50.0,
) -> Response:
    """A4 page with the calibration marker at its exact size, a 100 mm check bar and printing instructions."""
    return Response(
        marker_pdf(side_mm),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="texscan-marker-{side_mm:g}mm.pdf"'},
    )
