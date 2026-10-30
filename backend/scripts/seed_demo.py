"""Fill the database with 20 inspections (and one tuned profile) so the Dashboard, History and Profiles pages are not empty in a demo.

The images are SYNTHETIC textures with planted defects (same generators as the Inspect page samples). Every inspection is
a real pipeline run; the results are whatever the methods decide, including their mistakes. Timestamps are spread over the
last two weeks so the activity chart has a shape. Run from the repo root:

    backend/.venv/Scripts/python backend/scripts/seed_demo.py            (macOS/Linux: backend/.venv/bin/python)
    ... seed_demo.py --force        replace the demo data (inspections named demo-*.png and the "Demo weave" profile)

Uses data/texscan.db unless TEXSCAN_DB is set.
"""

import argparse
import sys
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from sqlmodel import Session, col, select

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_samples as ms  # noqa: E402  (generators for the sample textures)

from texscan import db  # noqa: E402
from texscan.api import storage  # noqa: E402
from texscan.api.service import store_inspection  # noqa: E402
from texscan.models import Inspection, Profile  # noqa: E402
from texscan.pipeline import PipelineConfig  # noqa: E402
from texscan.pipeline.types import Image  # noqa: E402
from texscan.profiles import tune_and_save  # noqa: E402

PREFIX = "demo-"
PROFILE_NAME = "Demo weave"
BATCH_SIZE = 8  # the last inspections share one batch id, so the batch report can be shown too
DAYS = 14


def u8(image: np.ndarray) -> Image:
    gray = np.clip(image, 0, 255).astype(np.uint8)
    return np.dstack([gray, gray, gray])


# (file name, family, builder). Family picks the method; "weave" also uses the tuned profile.
SPECS: list[tuple[str, str, Callable[[], np.ndarray]]] = [
    ("weave-clean-1", "weave", lambda: ms.weave(11)),
    ("weave-clean-2", "weave", lambda: ms.weave(12)),
    ("weave-clean-3", "weave", lambda: ms.weave(13)),
    ("weave-hole-1", "weave", lambda: ms.disc(ms.weave(14), (330, 170), 18, 40)),
    ("weave-hole-2", "weave", lambda: ms.disc(ms.weave(15), (150, 380), 12, 35)),
    ("weave-scratch-1", "weave", lambda: ms.scratch(ms.weave(16), (120, 260), (400, 300), 4, 232)),
    ("weave-scratch-2", "weave", lambda: ms.scratch(ms.weave(17), (60, 90), (300, 140), 3, 30)),
    ("plaid-clean-1", "plaid", lambda: ms.weave(21, "plaid")),
    ("plaid-clean-2", "plaid", lambda: ms.weave(22, "plaid")),
    ("plaid-stain-1", "plaid", lambda: ms.blotch(ms.weave(23, "plaid"), (250, 340), 38, 48, seed=11)),
    ("plaid-stain-2", "plaid", lambda: ms.blotch(ms.weave(24, "plaid"), (140, 140), 30, -45, seed=12)),
    ("plaid-hole-1", "plaid", lambda: ms.disc(ms.weave(25, "plaid"), (380, 300), 20, 235)),
    ("cloth-clean-1", "cloth", lambda: ms.uneven_cloth(31)),
    ("cloth-tear-1", "cloth", lambda: ms.scratch(ms.uneven_cloth(32), (150, 130), (330, 380), 9, 25)),
    ("cloth-tear-2", "cloth", lambda: ms.scratch(ms.uneven_cloth(33), (400, 80), (200, 300), 7, 230)),
    ("cloth-hole-1", "cloth", lambda: ms.disc(ms.uneven_cloth(34), (260, 220), 24, 30)),
    ("leather-clean-1", "leather", lambda: ms.leather(41)),
    ("leather-hole-1", "leather", lambda: ms.disc(ms.leather(42), (260, 300), 22, 45)),
    ("leather-hole-2", "leather", lambda: ms.disc(ms.leather(43), (120, 150), 16, 40)),
    ("leather-stain-1", "leather", lambda: ms.blotch(ms.leather(44), (330, 380), 34, 40, seed=13)),
]
METHODS = {"weave": "fft", "plaid": "fft", "cloth": "gabor", "leather": "gabor"}
assert len(SPECS) == 20


def remove_previous(session: Session) -> int:
    rows = session.exec(select(Inspection).where(col(Inspection.filename).startswith(PREFIX))).all()
    for row in rows:
        assert row.id is not None
        storage.delete_images(row.id)
        session.delete(row)
    profile = session.exec(select(Profile).where(Profile.name == PROFILE_NAME)).first()
    if profile:
        session.delete(profile)
    session.commit()
    return len(rows)


def seed(session: Session, now: datetime | None = None) -> list[tuple[str, str, str]]:
    """Tune the demo profile, run the 20 inspections and back-date them. Returns (file name, method, decision) per image."""
    now = now or datetime.now(timezone.utc)
    rng = np.random.default_rng(2024)
    good = [u8(ms.weave(100 + i)) for i in range(6)]
    profile, _ = tune_and_save(session, PROFILE_NAME, good, PipelineConfig(method="fft"))
    profile_config = PipelineConfig.model_validate_json(profile.config_json)

    batch_id = uuid.uuid4().hex
    outcomes: list[tuple[str, str, str]] = []
    for index, (name, family, build) in enumerate(SPECS):
        with_profile = family == "weave"
        config = profile_config if with_profile else PipelineConfig(method=METHODS[family])  # type: ignore[arg-type]
        in_batch = index >= len(SPECS) - BATCH_SIZE
        row = store_inspection(session, u8(build()), f"{PREFIX}{name}.png", config, profile.id if with_profile else None, None, batch_id if in_batch else None)
        row.created_at = now - timedelta(days=float(rng.uniform(0, DAYS - 1)), hours=float(rng.uniform(0, 10)))
        session.add(row)
        outcomes.append((row.filename, row.method, row.decision))
        print(f"  {row.filename:<28} {row.method:<17} {row.decision}  {row.defect_count} defect(s)")
    session.commit()
    return outcomes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="replace demo data that is already there")
    args = parser.parse_args()
    db.init_db()
    with Session(db.engine) as session:
        existing = session.exec(select(Inspection).where(col(Inspection.filename).startswith(PREFIX))).first()
        if existing and not args.force:
            sys.exit("Demo data is already in the database. Run with --force to replace it.")
        if args.force:
            print(f"Removed {remove_previous(session)} earlier demo inspections.")
        print(f"Database: {db.engine.url.database}")
        outcomes = seed(session)
    failed = sum(decision == "FAIL" for _, _, decision in outcomes)
    print(f"Done: {len(outcomes)} inspections ({failed} FAIL, {len(outcomes) - failed} PASS) and the profile '{PROFILE_NAME}'.")


if __name__ == "__main__":
    main()
