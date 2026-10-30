import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from sqlmodel import Session, col, update

from texscan.api.common import ApiError, get_profile_or_404, read_upload, resolve_config
from texscan.api.schemas import ProfileOut
from texscan.db import get_session
from texscan.models import Inspection, Profile
from texscan.profiles import list_profiles, profile_config, save_profile
from texscan.tuning import MAX_IMAGES, MIN_IMAGES, TuneReport, auto_tune

router = APIRouter(prefix="/profiles", tags=["profiles"])


def profile_out(p: Profile) -> ProfileOut:
    assert p.id is not None
    return ProfileOut(
        id=p.id,
        name=p.name,
        method=p.method,
        config=profile_config(p),
        report=TuneReport.model_validate(json.loads(p.report_json)),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.post("/autotune", response_model=ProfileOut, status_code=201)
def autotune(
    images: Annotated[list[UploadFile], File(description=f"{MIN_IMAGES}-{MAX_IMAGES} known-good images")],
    name: Annotated[str, Form(min_length=1, max_length=80)],
    method: Annotated[str, Form(description="fft | gabor | local_statistics")] = "fft",
    quantile: Annotated[float, Form(gt=50, lt=100)] = 99.5,
    config: Annotated[str | None, Form(description='JSON base-config overrides, e.g. {"max_side": 512}')] = None,
    session: Session = Depends(get_session),
) -> ProfileOut:
    """Tune thresholds on good images and store them as a named profile (re-using a name replaces that profile)."""
    base = resolve_config(session, None, method, config)
    decoded = [read_upload(f) for f in images]
    try:
        tuned, report = auto_tune(decoded, base, quantile)
    except ValueError as exc:
        raise ApiError(422, str(exc)) from exc
    return profile_out(save_profile(session, name.strip(), tuned, report))


@router.get("", response_model=list[ProfileOut])
def get_profiles(session: Session = Depends(get_session)) -> list[ProfileOut]:
    return [profile_out(p) for p in list_profiles(session)]


@router.get("/{profile_id}", response_model=ProfileOut)
def get_profile(profile_id: int, session: Session = Depends(get_session)) -> ProfileOut:
    return profile_out(get_profile_or_404(session, profile_id))


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: int, session: Session = Depends(get_session)) -> Response:
    """Inspections made with the profile are kept; their profile_id becomes null."""
    profile = get_profile_or_404(session, profile_id)
    session.exec(update(Inspection).where(col(Inspection.profile_id) == profile_id).values(profile_id=None))
    session.delete(profile)
    session.commit()
    return Response(status_code=204)
