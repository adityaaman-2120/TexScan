from collections.abc import Iterator
from pathlib import Path

import cv2
import pytest
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine, select

from tests.conftest import add_blob, make_noisy_material
from texscan import db
from texscan.cli import main
from texscan.models import Profile
from texscan.pipeline import PipelineConfig
from texscan.profiles import (
    ProfileNotFoundError,
    delete_profile,
    get_profile,
    inspect_with_profile,
    list_profiles,
    profile_config,
    save_profile,
    tune_and_save,
)
from texscan.tuning import TuneReport

GOOD = [make_noisy_material(s) for s in range(6)]
CFG = PipelineConfig.model_validate({"max_side": 256})


@pytest.fixture
def engine() -> Engine:
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    db.init_db(eng)
    return eng


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    with Session(engine) as s:
        yield s


def _report(**kw: object) -> TuneReport:
    base = dict(
        method="fft", threshold_param="threshold.min_threshold", threshold=20.0, quantile=99.5,
        score_percentiles={"p50": 1.0}, min_area=100, fp_component_count=3, fp_max_area=50,
        loo_pass_rate=1.0, n_images=6,
    )  # fmt: skip
    return TuneReport(**{**base, **kw})  # type: ignore[arg-type]


def test_save_get_roundtrip_preserves_config(session: Session) -> None:
    config = CFG.model_copy(update={"method": "gabor"})
    saved = save_profile(session, "Denim", config, _report(method="gabor"))
    assert saved.id is not None and saved.method == "gabor"
    loaded = get_profile(session, "Denim")
    assert profile_config(loaded) == config
    assert TuneReport.model_validate_json(loaded.report_json).min_area == 100


def test_saving_the_same_name_updates_instead_of_duplicating(session: Session) -> None:
    save_profile(session, "Denim", CFG, _report(min_area=100))
    first = get_profile(session, "Denim")
    changed = CFG.model_copy(update={"max_defects": 3})
    save_profile(session, "Denim", changed, _report(min_area=250))
    assert len(session.exec(select(Profile)).all()) == 1
    again = get_profile(session, "Denim")
    assert again.id == first.id and profile_config(again).max_defects == 3
    assert again.updated_at >= first.created_at


def test_names_are_distinct_listed_sorted_and_deletable(session: Session) -> None:
    for name in ("Ceramic tile", "Denim"):
        save_profile(session, name, CFG, _report())
    assert [p.name for p in list_profiles(session)] == ["Ceramic tile", "Denim"]
    delete_profile(session, "Denim")
    assert [p.name for p in list_profiles(session)] == ["Ceramic tile"]
    with pytest.raises(ProfileNotFoundError, match="Denim"):
        get_profile(session, "Denim")
    with pytest.raises(ProfileNotFoundError):
        delete_profile(session, "Denim")


def test_tune_and_save_then_inspect_with_the_profile(session: Session) -> None:
    profile, report = tune_and_save(session, "Denim", GOOD, CFG)
    assert profile.name == "Denim" and report.n_images == 6
    stored = profile_config(get_profile(session, "Denim"))
    assert stored.threshold.min_threshold == report.threshold and stored.morphology.min_area == report.min_area
    heldout = make_noisy_material(500)
    assert inspect_with_profile(session, "Denim", heldout).decision == "PASS"
    defective = inspect_with_profile(session, "Denim", add_blob(heldout, (128, 190), 16, 40))
    assert defective.decision == "FAIL" and defective.defects[0].defect_type is not None


def test_inspecting_with_unknown_profile_fails_clearly(session: Session) -> None:
    with pytest.raises(ProfileNotFoundError):
        inspect_with_profile(session, "Nope", GOOD[0])


def test_profile_is_used_instead_of_defaults(session: Session) -> None:
    """The same image gives a different verdict with a profile that tolerates defects."""
    blob_image = add_blob(GOOD[0], (128, 190), 16, 40)
    tolerant = CFG.model_copy(update={"max_defects": 50, "max_area_percent": 50.0})
    save_profile(session, "Lenient", tolerant, _report())
    from texscan.pipeline import run_pipeline

    assert run_pipeline(blob_image, CFG).decision == "FAIL"
    assert inspect_with_profile(session, "Lenient", blob_image).decision == "PASS"


# --- CLI -------------------------------------------------------------------------------------------
@pytest.fixture
def cli_db(engine: Engine, monkeypatch: pytest.MonkeyPatch) -> Engine:
    monkeypatch.setattr(db, "engine", engine)
    return engine


def test_cli_tune_profiles_and_inspect_with_profile(
    cli_db: Engine, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    paths = []
    for i, img in enumerate([*GOOD, add_blob(make_noisy_material(500), (128, 190), 16, 40)]):
        paths.append(tmp_path / f"{i}.png")
        cv2.imwrite(str(paths[-1]), img)
    good, defective = [str(p) for p in paths[:6]], str(paths[6])

    assert main(["tune", "Denim", *good, "--max-side", "256"]) == 0
    out = capsys.readouterr().out
    assert "profile 'Denim' saved" in out and "leave-one-out" in out

    assert main(["profiles"]) == 0
    assert "Denim\tfft" in capsys.readouterr().out

    assert main(["inspect", defective, "--profile", "Denim", "--out", str(tmp_path / "o")]) == 0
    out = capsys.readouterr().out
    assert out.startswith("FAIL") and "#1" in out
    assert (tmp_path / "o" / "result.json").exists()

    assert main(["profiles", "--delete", "Denim"]) == 0
    assert "deleted 'Denim'" in capsys.readouterr().out


def test_cli_reports_missing_profile_and_too_few_images(
    cli_db: Engine, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    img = tmp_path / "a.png"
    cv2.imwrite(str(img), GOOD[0])
    assert main(["inspect", str(img), "--profile", "Ghost"]) == 2
    assert "no profile named 'Ghost'" in capsys.readouterr().out
    assert main(["tune", "X", str(img), "--max-side", "256"]) == 2
    assert "5-20" in capsys.readouterr().out


def test_cli_missing_image_is_a_clean_error(cli_db: Engine, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["inspect", str(tmp_path / "nope.png")]) == 2
    assert capsys.readouterr().out.startswith("error:")
