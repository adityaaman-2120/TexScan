"""Four-point fabric grading (ASTM D5430). Pure functions: numbers in, numbers out.

THE RULES USED (also in docs/GRADING.md, with sources; the standard's own text was not available, so check them)

1. Points for one defect, by its LONGEST dimension in either direction:
       <= 3 in -> 1 point;  > 3 and <= 6 in -> 2;  > 6 and <= 9 in -> 3;  > 9 in -> 4.   (boundaries go to the smaller class)
2. Holes and openings, by their largest dimension. Sources disagree, so it is a setting `hole_rule`:
       "tiered" (default): <= 1 in -> 2 points, > 1 in -> 4 points.      "any_four": any hole -> 4 points.
3. At most 4 points are charged for any one linear yard (36 in of roll length), however many defects it holds.
   A defect belongs to the yard containing its centre. A defect that runs along the roll for MORE THAN ONE YARD
   (continuous) is charged 4 points in EVERY yard it runs through.
       total points = sum over yards of min(4, points of the defects in that yard)
4. Points per 100 square yards = total points * 36 * 100 / (length inspected in yards * cuttable width in inches)
                               = total points * 3600 / (yards * inches)
5. Accepted when points per 100 sq yd <= limit (default 40; a trade convention, set per roll; exactly the limit is accepted).
   The standard has no letter grades: the grade is "First quality" (accepted) or "Off quality" (rejected).
6. 1 yd = 0.9144 m and 1 in = 25.4 mm, exactly.
"""

import math
from dataclasses import dataclass
from typing import Literal

from texscan.pipeline.types import Defect

YARD_M = 0.9144
INCH_MM = 25.4
INCHES_PER_YARD = 36.0
MAX_POINTS_PER_YARD = 4
DEFAULT_LIMIT = 40.0
HOLE_SMALL_IN = 1.0  # "tiered" hole rule: this size or smaller is 2 points
TIER_LIMITS_IN = (3.0, 6.0, 9.0)  # upper bounds of the 1, 2 and 3 point classes
EPS = 1e-9

HoleRule = Literal["tiered", "any_four"]
Along = Literal["vertical", "horizontal"]  # the picture axis that runs along the roll


def length_points(length_in: float) -> int:
    """1 / 2 / 3 / 4 points for a longest dimension of up to 3 / 6 / 9 inches / more."""
    for points, bound in enumerate(TIER_LIMITS_IN, start=1):
        if length_in <= bound + EPS:
            return points
    return MAX_POINTS_PER_YARD


def defect_points(length_in: float, is_hole: bool, hole_rule: HoleRule = "tiered") -> int:
    """Points of one defect: the length tiers, or the hole rule for a hole."""
    if not is_hole:
        return length_points(length_in)
    if hole_rule == "any_four":
        return MAX_POINTS_PER_YARD
    return 2 if length_in <= HOLE_SMALL_IN + EPS else 4


@dataclass(frozen=True)
class RollDefect:
    """One scored defect, positioned along the roll (metres from the start)."""

    capture_id: int
    defect_id: int
    defect_type: str
    position_m: float  # centre along the roll
    start_m: float
    end_m: float
    length_in: float
    length_mm: float
    width_mm: float
    area_mm2: float
    is_hole: bool
    points: int

    @property
    def extent_yd(self) -> float:
        return (self.end_m - self.start_m) / YARD_M

    @property
    def continuous(self) -> bool:
        """Runs along the roll for more than one yard."""
        return self.extent_yd > 1.0 + EPS


@dataclass(frozen=True)
class RollGrade:
    total_points: int  # after the 4 per yard cap
    raw_points: int  # before the cap
    points_per_100_sq_yd: float
    limit: float
    accepted: bool
    grade: str
    yards: dict[int, tuple[int, int]]  # yard index -> (raw points, capped points)


def score_defect(
    capture_id: int,
    defect: Defect,
    capture_position_m: float,
    along: Along = "vertical",
    hole_rule: HoleRule = "tiered",
) -> RollDefect | None:
    """Position and score one measured defect of a capture; None when it has no real-world size (uncalibrated).

    The scale (mm per pixel) is length_mm / length_px, so no image size is needed. The centre and the extent along the
    roll come from the defect's bounding box on the picture axis that runs along the roll.
    """
    if defect.length_mm is None or defect.width_mm is None or defect.area_mm2 is None or not defect.length_px:
        return None
    mm_per_px = defect.length_mm / defect.length_px
    x, y, w, h = defect.bbox
    start_px, extent_px = (y, h) if along == "vertical" else (x, w)
    start_m = capture_position_m + start_px * mm_per_px / 1000.0
    end_m = start_m + extent_px * mm_per_px / 1000.0
    length_in = defect.length_mm / INCH_MM
    is_hole = defect.defect_type == "hole"
    return RollDefect(
        capture_id=capture_id,
        defect_id=defect.id,
        defect_type=defect.defect_type or "unknown",
        position_m=(start_m + end_m) / 2,
        start_m=start_m,
        end_m=end_m,
        length_in=length_in,
        length_mm=defect.length_mm,
        width_mm=defect.width_mm,
        area_mm2=defect.area_mm2,
        is_hole=is_hole,
        points=defect_points(length_in, is_hole, hole_rule),
    )


def yards_charged(defect: RollDefect) -> list[tuple[int, int]]:
    """(yard index, points) pairs: the yard of its centre, or every yard it runs through when it is continuous."""
    if defect.continuous:
        start_yd, end_yd = defect.start_m / YARD_M, defect.end_m / YARD_M
        first, last = math.floor(start_yd + EPS), max(math.ceil(end_yd - EPS) - 1, math.floor(start_yd + EPS))
        return [(yard, MAX_POINTS_PER_YARD) for yard in range(first, last + 1)]
    return [(math.floor(defect.position_m / YARD_M + EPS), defect.points)]


def yard_tallies(defects: list[RollDefect]) -> dict[int, tuple[int, int]]:
    """yard index -> (raw points, points after the 4 per yard cap), for yards that have defects."""
    raw: dict[int, int] = {}
    for d in defects:
        for yard, points in yards_charged(d):
            raw[yard] = raw.get(yard, 0) + points
    return {yard: (points, min(points, MAX_POINTS_PER_YARD)) for yard, points in sorted(raw.items())}


def points_per_100_sq_yd(total_points: float, length_yd: float, width_in: float) -> float:
    """total * 36 * 100 / (yards * inches): points scaled to 100 square yards of fabric."""
    if length_yd <= 0 or width_in <= 0:
        raise ValueError("the length inspected and the width must be positive")
    return total_points * INCHES_PER_YARD * 100.0 / (length_yd * width_in)


def grade_roll(defects: list[RollDefect], length_yd: float, width_in: float, limit: float = DEFAULT_LIMIT) -> RollGrade:
    """Total points (with the per-yard cap), points per 100 sq yd, and the verdict against the limit."""
    yards = yard_tallies(defects)
    total = sum(capped for _, capped in yards.values())
    raw = sum(r for r, _ in yards.values())
    score = points_per_100_sq_yd(total, length_yd, width_in)
    accepted = score <= limit + EPS
    return RollGrade(
        total_points=total,
        raw_points=raw,
        points_per_100_sq_yd=score,
        limit=limit,
        accepted=accepted,
        grade="First quality" if accepted else "Off quality",
        yards=yards,
    )


def m_to_yd(metres: float) -> float:
    return metres / YARD_M


def mm_to_in(millimetres: float) -> float:
    return millimetres / INCH_MM
