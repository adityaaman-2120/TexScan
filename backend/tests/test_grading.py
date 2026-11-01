"""The four-point rules in texscan/grading.py, checked against docs/GRADING.md."""

import pytest

from texscan.grading import (
    INCH_MM,
    YARD_M,
    RollDefect,
    defect_points,
    grade_roll,
    length_points,
    points_per_100_sq_yd,
    score_defect,
    yard_tallies,
    yards_charged,
)
from texscan.pipeline.types import Defect


def rd(position_yd: float, points: int, extent_yd: float = 0.01, hole: bool = False) -> RollDefect:
    """A scored defect centred at position_yd along the roll."""
    centre = position_yd * YARD_M
    half = extent_yd * YARD_M / 2
    return RollDefect(1, 1, "hole" if hole else "stain", centre, centre - half, centre + half, 1.0, 25.4, 5.0, 100.0, hole, points)


def measured(bbox: tuple[int, int, int, int], length_px: float, mm_per_px: float, kind: str | None = "stain") -> Defect:
    return Defect(
        id=3, bbox=bbox, area=100, centroid=(0, 0), perimeter=10, aspect_ratio=2, solidity=1, orientation_deg=0,
        defect_type=kind, length_px=length_px, width_px=2, length_mm=length_px * mm_per_px, width_mm=2 * mm_per_px, area_mm2=100 * mm_per_px**2,
    )  # type: ignore[arg-type]  # fmt: skip


# ---------- points of one defect ----------


@pytest.mark.parametrize(
    ("length_in", "points"),
    [(0.1, 1), (3.0, 1), (3.01, 2), (6.0, 2), (6.01, 3), (9.0, 3), (9.01, 4), (40.0, 4)],
)
def test_length_tiers_and_their_boundaries(length_in: float, points: int) -> None:
    assert length_points(length_in) == points


@pytest.mark.parametrize(("length_in", "points"), [(0.2, 2), (1.0, 2), (1.01, 4), (8.0, 4)])
def test_tiered_hole_rule(length_in: float, points: int) -> None:
    assert defect_points(length_in, is_hole=True, hole_rule="tiered") == points


def test_any_four_hole_rule_and_non_holes_ignore_it() -> None:
    assert defect_points(0.2, True, "any_four") == 4
    assert defect_points(0.2, False, "any_four") == 1  # the hole rule only applies to holes


# ---------- yards, the cap and continuous defects ----------


def test_a_defect_belongs_to_the_yard_of_its_centre() -> None:
    assert yards_charged(rd(0.99, 2)) == [(0, 2)]
    assert yards_charged(rd(1.01, 2)) == [(1, 2)]
    assert yards_charged(rd(5.5, 1)) == [(5, 1)]


def test_a_yard_is_capped_at_four_points() -> None:
    tallies = yard_tallies([rd(2.1, 1), rd(2.3, 1), rd(2.5, 2), rd(2.9, 3)])  # 7 raw points in yard 2
    assert tallies == {2: (7, 4)}
    ten_small = [rd(3.0 + i * 0.05, 1) for i in range(10)]
    assert yard_tallies(ten_small) == {3: (10, 4)}  # ten 1-point defects still score 4


def test_separate_yards_add_up() -> None:
    assert yard_tallies([rd(0.5, 3), rd(1.5, 2), rd(1.6, 4), rd(7.2, 1)]) == {0: (3, 3), 1: (6, 4), 7: (1, 1)}


def test_a_continuous_defect_is_four_points_in_every_yard_it_runs_through() -> None:
    streak = rd(2.5, 4, extent_yd=2.0)  # runs from 1.5 yd to 3.5 yd
    assert streak.continuous
    assert yards_charged(streak) == [(1, 4), (2, 4), (3, 4)]
    assert not rd(2.5, 4, extent_yd=1.0).continuous  # exactly one yard is not "more than"


def test_a_continuous_defect_exactly_on_yard_boundaries_charges_only_its_yards() -> None:
    streak = rd(1.5, 4, extent_yd=1.5)  # 0.75 to 2.25 yd
    assert [y for y, _ in yards_charged(streak)] == [0, 1, 2]
    aligned = rd(2.0, 4, extent_yd=2.0)  # 1.0 to 3.0 yd: yards 1 and 2, not 3
    assert [y for y, _ in yards_charged(aligned)] == [1, 2]


# ---------- the roll score ----------


def test_formula_matches_the_published_worked_example() -> None:
    assert points_per_100_sq_yd(24, 120, 46) == pytest.approx(15.652, abs=1e-3)
    assert points_per_100_sq_yd(24, 120, 46) == pytest.approx(24 * 3600 / (120 * 46))


def test_formula_scales_with_width_and_length() -> None:
    assert points_per_100_sq_yd(10, 100, 36) == pytest.approx(10.0)  # 100 yd x 36 in is exactly 100 sq yd
    assert points_per_100_sq_yd(10, 50, 36) == pytest.approx(20.0)
    assert points_per_100_sq_yd(10, 100, 72) == pytest.approx(5.0)


@pytest.mark.parametrize(("length", "width"), [(0, 40), (10, 0), (-1, 40)])
def test_formula_needs_positive_length_and_width(length: float, width: float) -> None:
    with pytest.raises(ValueError):
        points_per_100_sq_yd(5, length, width)


def test_grade_roll_uses_the_capped_total() -> None:
    defects = [rd(0.5, 4), rd(0.6, 4), rd(1.5, 2)]  # yard 0: 8 raw -> 4; yard 1: 2
    grade = grade_roll(defects, length_yd=100, width_in=36)
    assert (grade.raw_points, grade.total_points) == (10, 6)
    assert grade.points_per_100_sq_yd == pytest.approx(6.0)
    assert grade.accepted and grade.grade == "First quality"
    assert grade.yards == {0: (8, 4), 1: (2, 2)}


def test_acceptance_limit_is_inclusive_and_configurable() -> None:
    forty = [rd(i + 0.5, 4) for i in range(10)]  # 10 x 4 = 40 points on 100 yd x 36 in = exactly 40 per 100 sq yd
    at_limit = grade_roll(forty, 100, 36)
    assert at_limit.points_per_100_sq_yd == pytest.approx(40.0) and at_limit.accepted
    over = grade_roll([*forty, rd(50.5, 1)], 100, 36)
    assert over.points_per_100_sq_yd == pytest.approx(41.0) and not over.accepted and over.grade == "Off quality"
    assert grade_roll([*forty, rd(50.5, 1)], 100, 36, limit=45).accepted  # a looser buyer limit
    assert not grade_roll(forty, 100, 36, limit=30).accepted  # a stricter one


def test_an_empty_roll_scores_zero_and_is_accepted() -> None:
    grade = grade_roll([], 100, 40)
    assert (grade.total_points, grade.points_per_100_sq_yd, grade.accepted) == (0, 0.0, True)


# ---------- scoring a measured defect ----------


def test_score_defect_positions_along_the_vertical_axis() -> None:
    d = measured(bbox=(10, 200, 8, 100), length_px=100, mm_per_px=2.0)  # 200 mm long = 7.87 in, 2 mm per pixel
    s = score_defect(7, d, capture_position_m=10.0)
    assert s is not None
    assert s.start_m == pytest.approx(10.0 + 200 * 2 / 1000)  # top edge + 200 px
    assert s.end_m == pytest.approx(10.0 + 300 * 2 / 1000)
    assert s.position_m == pytest.approx(10.5)
    assert s.length_in == pytest.approx(200 / INCH_MM) and s.points == 3  # 6 < 7.87 <= 9
    assert (s.capture_id, s.defect_id) == (7, 3)


def test_score_defect_can_use_the_horizontal_axis() -> None:
    d = measured(bbox=(300, 5, 50, 20), length_px=50, mm_per_px=1.0)
    s = score_defect(1, d, 0.0, along="horizontal")
    assert s is not None and s.start_m == pytest.approx(0.3) and s.end_m == pytest.approx(0.35)


def test_score_defect_applies_the_hole_rule_by_type() -> None:
    small_hole = measured(bbox=(0, 0, 10, 10), length_px=10, mm_per_px=2.0, kind="hole")  # 20 mm = 0.79 in
    assert score_defect(1, small_hole, 0.0).points == 2  # type: ignore[union-attr]
    assert score_defect(1, small_hole, 0.0, hole_rule="any_four").points == 4  # type: ignore[union-attr]
    same_size_stain = measured(bbox=(0, 0, 10, 10), length_px=10, mm_per_px=2.0, kind="stain")
    assert score_defect(1, same_size_stain, 0.0).points == 1  # type: ignore[union-attr]


def test_an_uncalibrated_defect_cannot_be_scored() -> None:
    d = Defect(id=1, bbox=(0, 0, 5, 5), area=20, centroid=(2, 2), perimeter=10, aspect_ratio=1, solidity=1, orientation_deg=0, length_px=5, width_px=5)
    assert score_defect(1, d, 0.0) is None
