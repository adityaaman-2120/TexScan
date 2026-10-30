import pytest

from tests.conftest import add_blob, make_noisy_material, make_texture
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.tuning import MAX_IMAGES, MIN_IMAGES, TUNABLE, TuneReport, _loo_pass_rate, _min_area_from, auto_tune

GOOD = [make_noisy_material(s) for s in range(8)]
HELD_OUT = [make_noisy_material(100 + s) for s in range(10)]
BLOB = (128, 190, 16)  # row, col, radius


def _cfg(method: str = "fft") -> PipelineConfig:
    return PipelineConfig.model_validate({"method": method, "max_side": 256, "local_stats": {"window": 16}})


def _passes(images: list, config: PipelineConfig) -> int:  # type: ignore[type-arg]
    return sum(run_pipeline(img, config).decision == "PASS" for img in images)


def test_min_area_and_loo_helpers() -> None:
    assert _min_area_from([10, 30, 20], 50, 2.0) == 60 and _min_area_from([5], 50, 2.0) == 50
    assert _min_area_from([], 50, 2.0) == 50
    # image 2 (area 90) exceeds what the others justify (max 30 * 2 = 60 -> bigger than 50), image 0/1 stay under
    assert _loo_pass_rate([10, 30, 90], 50, 2.0) == pytest.approx(2 / 3)
    assert _loo_pass_rate([0, 0, 0], 50, 2.0) == 1.0


def test_defaults_false_alarm_on_noisy_material_but_tuned_profile_passes_good_images() -> None:
    base = _cfg()
    assert _passes(HELD_OUT, base) < len(HELD_OUT)  # premise: untuned config raises false alarms here
    tuned, report = auto_tune(GOOD, base)
    assert _passes(GOOD, tuned) == len(GOOD)  # every image used for tuning passes
    assert _passes(HELD_OUT, tuned) >= 9  # ...and it generalizes to unseen good images


def test_tuned_profile_still_detects_a_real_defect() -> None:
    tuned, _ = auto_tune(GOOD, _cfg())
    result = run_pipeline(add_blob(HELD_OUT[0], BLOB[:2], BLOB[2], 40), tuned)
    assert result.decision == "FAIL"
    cx, cy = BLOB[1], BLOB[0]
    assert any(abs(d.centroid[0] - cx) < 20 and abs(d.centroid[1] - cy) < 20 for d in result.defects)


def test_report_contents_and_config_changes() -> None:
    base = _cfg()
    tuned, report = auto_tune(GOOD, base)
    section, field, floor = TUNABLE["fft"]
    assert report.method == "fft" and report.threshold_param == f"{section}.{field}" and report.n_images == 8
    assert getattr(getattr(tuned, section), field) == report.threshold >= floor
    p = report.score_percentiles
    assert p["p50"] < p["p99"] <= p["p99.5"] <= p["p99.9"] <= p["max"]
    assert report.threshold == pytest.approx(p["p99.5"] * 1.1, rel=0.05)  # quantile * margin
    assert tuned.morphology.min_area == report.min_area >= base.morphology.min_area
    assert report.fp_max_area < report.min_area or report.fp_max_area == 0
    assert 0 <= report.loo_pass_rate <= 1
    assert base.threshold.min_threshold == 12.0  # the input config is not mutated
    assert TuneReport.model_validate_json(report.model_dump_json()) == report


def test_higher_quantile_gives_higher_threshold() -> None:
    _, low = auto_tune(GOOD, _cfg(), quantile=99.0)
    _, high = auto_tune(GOOD, _cfg(), quantile=99.9)
    assert high.threshold > low.threshold


@pytest.mark.parametrize("method", ["gabor", "local_statistics"])
def test_other_methods_tune_and_pass_their_good_images(method: str) -> None:
    tuned, report = auto_tune(GOOD, _cfg(method))
    assert report.threshold_param.endswith(".k") and report.threshold >= 3.0
    assert _passes(GOOD, tuned) == len(GOOD)


def test_clean_images_warn_that_the_threshold_hit_its_floor() -> None:
    clean = [make_texture("sinusoid", seed=s) for s in range(6)]
    _, report = auto_tune(clean, _cfg("local_statistics"))
    assert report.threshold == 3.0 and any("floor" in w for w in report.warnings)


def test_large_min_area_is_flagged() -> None:
    very_noisy = [make_noisy_material(s, noise=25.0) for s in range(6)]
    _, report = auto_tune(very_noisy, _cfg())
    assert report.min_area > 0.001 * 256 * 256 and any("min_area" in w for w in report.warnings)


def test_rejects_wrong_image_counts_and_unsupported_method() -> None:
    with pytest.raises(ValueError, match="5-20"):
        auto_tune(GOOD[: MIN_IMAGES - 1], _cfg())
    with pytest.raises(ValueError, match="5-20"):
        auto_tune([GOOD[0]] * (MAX_IMAGES + 1), _cfg())
    with pytest.raises(ValueError, match="reference"):
        auto_tune(GOOD, _cfg("golden_template"))
