"""Roll assembly: turn a roll and its captures into positioned, scored defects and a summary.

The scoring rules are in texscan/grading.py (and docs/GRADING.md); this module only gathers the data and the warnings.
"""

import json
from collections import Counter
from dataclasses import dataclass

from sqlmodel import Session, col, select

from texscan.api import storage
from texscan.api.roll_schemas import RollCaptureOut, RollDefectOut, RollListItem, RollOut, RollStats, RollSummary, SupplierStat, TypeCount, YardPoints
from texscan.grading import YARD_M, RollDefect, grade_roll, m_to_yd, mm_to_in, score_defect
from texscan.models import Inspection, Profile, Roll, RollCapture
from texscan.pipeline.types import Defect

OVERLAP_TOLERANCE_M = 0.01
GAP_TOLERANCE_M = 0.05
COMPLETE_COVERAGE = 98.0  # percent; below this a completed roll is flagged as only partly inspected
TOP_TYPES = 5


@dataclass
class Assessment:
    defects: list[RollDefect]
    summary: RollSummary


def _intervals(captures: list[RollCapture]) -> list[tuple[float, float]]:
    return sorted((c.start_m, c.start_m + c.covered_m) for c in captures)


def covered_length(captures: list[RollCapture], roll_length_m: float) -> float:
    """Metres of the roll that at least one capture covers (overlaps counted once), within the roll length."""
    total, reach = 0.0, 0.0
    for start, end in _intervals(captures):
        start, end = max(start, 0.0), min(end, roll_length_m)
        if end <= start:
            continue
        total += end - max(start, reach)
        reach = max(reach, end)
    return max(total, 0.0)


def coverage_warnings(captures: list[RollCapture], roll: Roll, coverage_percent: float) -> list[str]:
    """Overlaps (a defect would be scored twice), gaps (an uninspected stretch) and an incomplete roll."""
    warnings: list[str] = []
    spans = _intervals(captures)
    for (a_start, a_end), (b_start, b_end) in zip(spans, spans[1:]):
        if b_start < a_end - OVERLAP_TOLERANCE_M:
            warnings.append(f"Captures at {a_start:.2f} m and {b_start:.2f} m overlap by {a_end - b_start:.2f} m. A defect in the overlap is scored twice.")
        elif b_start - a_end > GAP_TOLERANCE_M:
            warnings.append(f"Nothing was inspected between {a_end:.2f} m and {b_start:.2f} m ({b_start - a_end:.2f} m).")
    if roll.status == "complete" and captures and coverage_percent < COMPLETE_COVERAGE:
        warnings.append(f"Only {coverage_percent:.0f}% of the roll length is covered by captures. The score assumes the rest is clean.")
    return warnings


def assess(roll: Roll, captures: list[RollCapture], inspections: dict[int, Inspection]) -> Assessment:
    """Score every measured defect of every capture, then the roll."""
    defects: list[RollDefect] = []
    ungraded = 0
    for capture in captures:
        row = inspections.get(capture.inspection_id)
        if row is None or capture.id is None:
            continue
        for raw in json.loads(row.defects_json):
            scored = score_defect(capture.id, Defect.model_validate(raw), capture.start_m, roll.along, roll.hole_rule)  # type: ignore[arg-type]
            if scored is None:
                ungraded += 1
            else:
                defects.append(scored)
    defects.sort(key=lambda d: d.position_m)

    covered = covered_length(captures, roll.length_m)
    furthest = max((min(c.start_m + c.covered_m, roll.length_m) for c in captures), default=0.0)
    inspected_m = roll.length_m if roll.status == "complete" else furthest
    coverage_percent = 100.0 * covered / roll.length_m if roll.length_m > 0 else 0.0
    width_in = mm_to_in(roll.width_mm)

    if inspected_m > 0:
        grade = grade_roll(defects, m_to_yd(inspected_m), width_in, roll.limit)
        total, raw_points, score, accepted, label, yards = grade.total_points, grade.raw_points, grade.points_per_100_sq_yd, grade.accepted, grade.grade, grade.yards
    else:
        total = raw_points = 0
        score, accepted, label, yards = 0.0, True, "Not inspected", {}

    warnings = coverage_warnings(captures, roll, coverage_percent)
    if ungraded:
        warnings.append(f"{ungraded} defect(s) could not be scored because they have no real-world size. Calibrate the profile.")
    summary = RollSummary(
        total_points=total,
        raw_points=raw_points,
        points_per_100_sq_yd=score,
        limit=roll.limit,
        accepted=accepted,
        grade=label,
        provisional=roll.status != "complete",
        length_inspected_m=inspected_m,
        length_inspected_yd=m_to_yd(inspected_m),
        coverage_percent=coverage_percent,
        defect_count=len(defects),
        capture_count=len(captures),
        ungraded_defects=ungraded,
        yards=[YardPoints(yard=y, from_m=y * YARD_M, to_m=(y + 1) * YARD_M, raw=raw, points=capped) for y, (raw, capped) in yards.items()],
        warnings=warnings,
    )
    return Assessment(defects, summary)


def load_captures(session: Session, roll_id: int) -> tuple[list[RollCapture], dict[int, Inspection]]:
    captures = list(session.exec(select(RollCapture).where(RollCapture.roll_id == roll_id).order_by(col(RollCapture.start_m), col(RollCapture.id))))
    rows = {c.inspection_id: row for c in captures if (row := session.get(Inspection, c.inspection_id)) is not None}
    return captures, rows


def _capture_out(c: RollCapture, row: Inspection | None) -> RollCaptureOut:
    assert c.id is not None
    has_overlay = row is not None and "overlay" in json.loads(row.stages_json)
    overlay = storage.file_url(c.inspection_id, "overlay") if has_overlay else None
    return RollCaptureOut(
        id=c.id,
        inspection_id=c.inspection_id,
        filename=row.filename if row else "(deleted)",
        decision="FAIL" if row is None or row.decision == "FAIL" else "PASS",
        defect_count=row.defect_count if row else 0,
        position_m=c.position_m,
        start_m=c.start_m,
        covered_m=c.covered_m,
        thumbnail_url=overlay,
        overlay_url=overlay,
        created_at=c.created_at,
    )


def _defect_out(d: RollDefect, inspection_of: dict[int, int]) -> RollDefectOut:
    return RollDefectOut(
        capture_id=d.capture_id,
        inspection_id=inspection_of[d.capture_id],
        defect_id=d.defect_id,
        defect_type=d.defect_type,
        position_m=d.position_m,
        position_yd=m_to_yd(d.position_m),
        start_m=d.start_m,
        end_m=d.end_m,
        length_mm=d.length_mm,
        length_in=d.length_in,
        width_mm=d.width_mm,
        width_in=mm_to_in(d.width_mm),
        area_mm2=d.area_mm2,
        points=d.points,
        is_hole=d.is_hole,
        continuous=d.continuous,
    )


def roll_out(session: Session, roll: Roll) -> RollOut:
    assert roll.id is not None
    captures, rows = load_captures(session, roll.id)
    assessment = assess(roll, captures, rows)
    profile = session.get(Profile, roll.profile_id) if roll.profile_id is not None else None
    inspection_of = {c.id: c.inspection_id for c in captures if c.id is not None}
    return RollOut(
        id=roll.id,
        code=roll.code,
        supplier=roll.supplier,
        fabric=roll.fabric,
        profile_id=roll.profile_id,
        profile_name=profile.name if profile else None,
        width_mm=roll.width_mm,
        width_in=mm_to_in(roll.width_mm),
        length_m=roll.length_m,
        length_yd=m_to_yd(roll.length_m),
        limit=roll.limit,
        hole_rule=roll.hole_rule,  # type: ignore[arg-type]
        along=roll.along,  # type: ignore[arg-type]
        status=roll.status,  # type: ignore[arg-type]
        inspector=roll.inspector,
        notes=roll.notes,
        created_at=roll.created_at,
        updated_at=roll.updated_at,
        completed_at=roll.completed_at,
        summary=assessment.summary,
        captures=[_capture_out(c, rows.get(c.inspection_id)) for c in captures],
        defects=[_defect_out(d, inspection_of) for d in assessment.defects],
    )


def roll_list_item(session: Session, roll: Roll) -> RollListItem:
    assert roll.id is not None
    captures, rows = load_captures(session, roll.id)
    s = assess(roll, captures, rows).summary
    profile = session.get(Profile, roll.profile_id) if roll.profile_id is not None else None
    return RollListItem(
        id=roll.id,
        code=roll.code,
        supplier=roll.supplier,
        fabric=roll.fabric,
        profile_name=profile.name if profile else None,
        width_mm=roll.width_mm,
        length_m=roll.length_m,
        status=roll.status,  # type: ignore[arg-type]
        created_at=roll.created_at,
        completed_at=roll.completed_at,
        capture_count=s.capture_count,
        defect_count=s.defect_count,
        total_points=s.total_points,
        points_per_100_sq_yd=s.points_per_100_sq_yd,
        limit=roll.limit,
        accepted=s.accepted,
        grade=s.grade,
        provisional=s.provisional,
    )


def roll_stats(session: Session) -> RollStats:
    """KPIs over completed rolls, and the commonest defect types per supplier."""
    rolls = list(session.exec(select(Roll)))
    complete = [r for r in rolls if r.status == "complete"]
    per_supplier: dict[str, list[tuple[bool, float, Counter[str]]]] = {}
    scores: list[float] = []
    accepted = 0
    for roll in complete:
        assert roll.id is not None
        captures, rows = load_captures(session, roll.id)
        result = assess(roll, captures, rows)
        scores.append(result.summary.points_per_100_sq_yd)
        accepted += result.summary.accepted
        kinds = Counter(d.defect_type for d in result.defects)
        per_supplier.setdefault(roll.supplier.strip() or "(no supplier)", []).append((result.summary.accepted, result.summary.points_per_100_sq_yd, kinds))
    suppliers = []
    for name, entries in per_supplier.items():
        total_kinds: Counter[str] = Counter()
        for _, _, kinds in entries:
            total_kinds.update(kinds)
        suppliers.append(
            SupplierStat(
                supplier=name,
                rolls=len(entries),
                accepted=sum(1 for ok, _, _ in entries if ok),
                avg_points_per_100_sq_yd=sum(s for _, s, _ in entries) / len(entries),
                defects=sum(total_kinds.values()),
                top_defect_types=[TypeCount(defect_type=k, count=n) for k, n in total_kinds.most_common(TOP_TYPES)],
            )
        )
    suppliers.sort(key=lambda s: (-s.rolls, s.supplier))
    return RollStats(
        rolls_inspected=len(complete),
        rolls_open=len(rolls) - len(complete),
        accepted=accepted,
        rejected=len(complete) - accepted,
        acceptance_rate=100.0 * accepted / len(complete) if complete else None,
        avg_points_per_100_sq_yd=sum(scores) / len(scores) if scores else None,
        suppliers=suppliers,
    )
