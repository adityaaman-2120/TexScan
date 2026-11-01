"""Named, tuned configurations stored in SQLite."""

from datetime import datetime, timezone

from sqlmodel import Session, select

from texscan.models import Profile
from texscan.pipeline import PipelineConfig, PipelineResult, run_pipeline
from texscan.pipeline.types import Calibration, Image
from texscan.tuning import TuneReport, auto_tune


class ProfileNotFoundError(KeyError):
    pass


def save_profile(session: Session, name: str, config: PipelineConfig, report: TuneReport) -> Profile:
    """Create the profile, or replace the one with the same name (case-sensitive)."""
    profile = session.exec(select(Profile).where(Profile.name == name)).first() or Profile(name=name, method="", config_json="", report_json="")
    if config.calibration is None and profile.config_json:
        config = config.model_copy(update={"calibration": profile_config(profile).calibration})
    profile.method = config.method
    profile.config_json = config.model_dump_json()
    profile.report_json = report.model_dump_json()
    profile.updated_at = datetime.now(timezone.utc)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def set_calibration(session: Session, profile: Profile, calibration: Calibration | None) -> Profile:
    """Store (or, with None, clear) the real-world scale of a profile."""
    profile.config_json = profile_config(profile).model_copy(update={"calibration": calibration}).model_dump_json()
    profile.updated_at = datetime.now(timezone.utc)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def get_profile(session: Session, name: str) -> Profile:
    profile = session.exec(select(Profile).where(Profile.name == name)).first()
    if profile is None:
        raise ProfileNotFoundError(f"no profile named '{name}'")
    return profile


def list_profiles(session: Session) -> list[Profile]:
    return list(session.exec(select(Profile).order_by(Profile.name)))


def delete_profile(session: Session, name: str) -> None:
    session.delete(get_profile(session, name))
    session.commit()


def profile_config(profile: Profile) -> PipelineConfig:
    return PipelineConfig.model_validate_json(profile.config_json)


def tune_and_save(
    session: Session, name: str, images: list[Image], base: PipelineConfig | None = None, quantile: float = 99.5
) -> tuple[Profile, TuneReport]:
    config, report = auto_tune(images, base, quantile)
    return save_profile(session, name, config, report), report


def inspect_with_profile(session: Session, name: str, image: Image) -> PipelineResult:
    """Run an inspection with the tuned configuration stored under `name`."""
    return run_pipeline(image, profile_config(get_profile(session, name)))
