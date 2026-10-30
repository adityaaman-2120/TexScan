import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlmodel import Session, select

from texscan import db
from texscan.models import Inspection, Profile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import seed_demo  # noqa: E402


@pytest.fixture
def session(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("TEXSCAN_DATA_DIR", str(tmp_path / "files"))
    engine = db.make_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    db.init_db(engine)
    with Session(engine) as s:
        yield s


def test_seed_loads_twenty_inspections_and_remove_previous_deletes_only_them(session: Session) -> None:
    now = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)
    outcomes = seed_demo.seed(session, now)
    rows = session.exec(select(Inspection)).all()
    assert len(outcomes) == len(rows) == 20 and all(r.filename.startswith("demo-") for r in rows)
    days = {r.created_at.date() for r in rows}
    assert len(days) >= 7 and all(0 <= (now - r.created_at.replace(tzinfo=timezone.utc)).days <= seed_demo.DAYS for r in rows)
    decisions = {r.decision for r in rows}
    assert decisions == {"PASS", "FAIL"}  # the dashboard needs both
    assert len({r.method for r in rows}) >= 2
    assert len([r for r in rows if r.batch_id]) == seed_demo.BATCH_SIZE
    assert len({r.batch_id for r in rows if r.batch_id}) == 1
    profile = session.exec(select(Profile)).one()
    assert profile.name == seed_demo.PROFILE_NAME and any(r.profile_id == profile.id for r in rows)

    # one seeding run is slow (20 pipeline runs), so the clean-up check reuses it
    other = Inspection(filename="mine.png", method="fft", decision="PASS", defect_count=0, defect_area_percent=0.0, width=1, height=1, config_json="{}", defects_json="[]", timings_json="{}", histograms_json="{}", type_counts_json="{}")
    session.add(other)
    session.commit()
    assert seed_demo.remove_previous(session) == 20
    assert [r.filename for r in session.exec(select(Inspection)).all()] == ["mine.png"]
    assert session.exec(select(Profile)).all() == []
