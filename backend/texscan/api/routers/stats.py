import json
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, col, func, select

from texscan.api.schemas import DayCount, ProfileStat, StatsOut
from texscan.db import get_session
from texscan.models import Inspection, Profile

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=StatsOut)
def stats(
    days: Annotated[int, Query(ge=1, le=365, description="length of inspections_per_day")] = 30,
    session: Session = Depends(get_session),
) -> StatsOut:
    total = session.exec(select(func.count()).select_from(Inspection)).one()
    passed = session.exec(select(func.count()).select_from(Inspection).where(Inspection.decision == "PASS")).one()
    by_type: Counter[str] = Counter()
    for blob in session.exec(select(Inspection.type_counts_json)):
        by_type.update(json.loads(blob))

    timings = [sum(json.loads(blob).values()) for blob in session.exec(select(Inspection.timings_json))]
    avg_ms = sum(timings) / len(timings) if timings else None

    names = {p.id: p.name for p in session.exec(select(Profile))}
    grouped: dict[int | None, list[int]] = {}  # profile_id -> [passed, failed]
    for profile_id, decision, n in session.exec(select(Inspection.profile_id, Inspection.decision, func.count()).group_by(Inspection.profile_id, Inspection.decision)):
        grouped.setdefault(profile_id, [0, 0])[0 if decision == "PASS" else 1] += n
    by_profile = sorted(
        (
            ProfileStat(profile_id=pid, name=names.get(pid, "Defaults") if pid is not None else "Defaults", total=p + f, passed=p, pass_rate=p / (p + f))
            for pid, (p, f) in grouped.items()
        ),
        key=lambda x: (-x.total, x.name),
    )

    first = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    per_day = {first + timedelta(days=i): [0, 0] for i in range(days)}  # date -> [passed, failed]
    rows = session.exec(
        select(Inspection.created_at, Inspection.decision).where(
            col(Inspection.created_at) >= datetime.combine(first, time.min, tzinfo=timezone.utc)
        )
    )
    for created_at, decision in rows:
        day: date = created_at.date()
        if day in per_day:
            per_day[day][0 if decision == "PASS" else 1] += 1
    return StatsOut(
        total=total,
        passed=passed,
        failed=total - passed,
        pass_rate=passed / total if total else None,
        defects_by_type=dict(by_type),
        inspections_per_day=[DayCount(date=d, total=p + f, passed=p, failed=f) for d, (p, f) in per_day.items()],
        avg_processing_ms=avg_ms,
        by_profile=by_profile,
    )
