import numpy as np
import pytest

from tests.conftest import add_blob, add_scratch, make_texture
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.classify import MIN_CONFIDENCE, _match, _ramp, classify_defect, classify_defects
from texscan.pipeline.defects import extract_defects
from texscan.pipeline.types import Defect


def defect(**kw: object) -> Defect:
    """A defect with neutral defaults; override only what a case cares about."""
    base = dict(
        id=1, bbox=(0, 0, 10, 10), area=300, centroid=(5.0, 5.0), perimeter=60.0, aspect_ratio=1.0,
        solidity=0.95, orientation_deg=0.0, contrast=-70.0,
    )  # fmt: skip
    return Defect(**{**base, **kw})  # type: ignore[arg-type]


def test_ramp_both_directions_and_clipping() -> None:
    assert _ramp(5, 0, 10) == 0.5 and _ramp(-3, 0, 10) == 0 and _ramp(99, 0, 10) == 1
    assert _ramp(2.5, 1.5, 2.5) == 1 and _ramp(1.0, 2.5, 1.5) == 1 and _ramp(2.0, 2.5, 1.5) == 0.5


def test_match_needs_every_rule() -> None:
    assert _match([1.0, 0.5]) == 0.75 and _match([1.0, 0.0, 1.0]) == 0.0


@pytest.mark.parametrize(
    ("label", "features"),
    [
        ("hole", dict(aspect_ratio=1.1, solidity=0.97, contrast=-80)),  # round, dark
        ("tear_line", dict(aspect_ratio=30, solidity=0.9, contrast=60, area=3000, perimeter=520)),  # long, strong
        ("tear_line", dict(aspect_ratio=30, solidity=0.9, contrast=-70, area=9000, perimeter=520)),  # wide dark slit
        ("thread_fiber", dict(aspect_ratio=25, solidity=0.8, contrast=8, area=800, perimeter=400)),  # thin, faint
        ("stain", dict(aspect_ratio=1.4, solidity=0.7, contrast=-60, area=2000, perimeter=300)),  # ragged
        ("stain", dict(aspect_ratio=1.3, solidity=0.95, contrast=12, area=2000)),  # faint
        ("stain", dict(aspect_ratio=1.1, solidity=0.97, contrast=70, area=2000)),  # bright round
    ],
)
def test_each_type_is_recognised(label: str, features: dict[str, float]) -> None:
    result = classify_defect(defect(**features))
    assert result.label == label and result.confidence >= MIN_CONFIDENCE
    assert max(result.scores, key=lambda k: result.scores[k]) == label


def test_unknown_when_nothing_matches() -> None:
    # mid-elongation, mid-contrast, tiny: no rule set is satisfied
    result = classify_defect(defect(aspect_ratio=2.8, solidity=0.85, contrast=-35, area=60, perimeter=40))
    assert result.label == "unknown" and result.confidence == pytest.approx(1 - max(result.scores.values()))


def test_confidence_grows_with_rule_strength() -> None:
    line = dict(solidity=0.9, area=3000, perimeter=520)
    weak = classify_defect(defect(aspect_ratio=4.0, contrast=50, **line))
    strong = classify_defect(defect(aspect_ratio=30, contrast=80, **line))
    assert weak.label == strong.label == "tear_line"
    assert MIN_CONFIDENCE < weak.confidence < strong.confidence == 1.0


def test_missing_contrast_gives_neutral_not_crash() -> None:
    result = classify_defect(defect(contrast=None))
    assert result.label == "hole" and 0.5 < result.confidence < 1.0  # contrast rule counted as 0.5


def test_classify_defects_fills_fields_and_keeps_input() -> None:
    originals = [defect(), defect(id=2, aspect_ratio=30, contrast=60, area=3000, perimeter=520)]
    out = classify_defects(originals)
    assert [d.defect_type for d in out] == ["hole", "tear_line"]
    assert all(0 < (d.type_confidence or 0) <= 1 for d in out)
    assert originals[0].defect_type is None  # input untouched
    assert classify_defects([]) == []


def test_extract_defects_measures_contrast_to_surroundings() -> None:
    gray = np.full((100, 100), 120, np.uint8)
    gray[20:40, 20:40] = 40  # dark square
    gray[60:80, 60:80] = 220  # bright square
    mask = np.zeros_like(gray)
    mask[20:40, 20:40] = mask[60:80, 60:80] = 255
    dark, bright = extract_defects(mask, gray)
    assert dark.contrast == pytest.approx(-80) and bright.contrast == pytest.approx(100)
    assert all(d.contrast is None for d in extract_defects(mask))  # no gray -> unknown


def test_extract_defects_contrast_ignores_neighbouring_defects() -> None:
    gray = np.full((60, 60), 100, np.uint8)
    gray[20:30, 20:30] = 50
    gray[20:30, 33:43] = 250  # neighbour inside the first one's ring
    mask = np.zeros_like(gray)
    mask[20:30, 20:30] = mask[20:30, 33:43] = 255
    first, _ = extract_defects(mask, gray)
    assert first.contrast == pytest.approx(-50)  # ring pixels of the neighbour are excluded


def test_pipeline_classifies_planted_defects() -> None:
    clean = make_texture("sinusoid", 1024, 0, 64)
    hole = run_pipeline(add_blob(clean, (240, 800), 30, 40)).defects
    assert [d.defect_type for d in hole] == ["hole"]
    line = run_pipeline(add_scratch(clean, 510, 240, 760, 230, 4)).defects
    assert [d.defect_type for d in line] == ["tear_line"] and line[0].type_confidence > 0.5
    assert PipelineConfig().max_side == 1024
