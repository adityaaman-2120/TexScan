import numpy as np
import pytest

from tests.conftest import add_blob, add_scratch, make_texture
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.types import Defect, Image

EXPECTED_STAGES = [
    "original", "gray", "denoised", "enhanced", "spectrum", "spectrum_peaks",
    "notch_mask", "residual", "residual_abs", "mask_raw", "mask_clean", "overlay",
]  # fmt: skip

SCALE = 4  # 256 px test images are upscaled to the default 1024


def _hits(defect: Defect, x: int, y: int) -> bool:
    bx, by, bw, bh = defect.bbox
    return bx - 8 <= x * SCALE <= bx + bw + 8 and by - 8 <= y * SCALE <= by + bh + 8


def test_clean_texture_passes(clean_texture: Image) -> None:
    result = run_pipeline(clean_texture)
    assert result.decision == "PASS"
    assert result.defects == [] and result.defect_area_percent == 0


def test_finds_scratch_and_blob(clean_texture: Image) -> None:
    img = add_blob(add_scratch(clean_texture), center=(60, 200))
    result = run_pipeline(img)
    assert result.decision == "FAIL"
    assert any(_hits(d, 125, 129) for d in result.defects), "scratch not found"
    assert any(_hits(d, 200, 60) for d in result.defects), "blob not found"
    scratch = max(result.defects, key=lambda d: d.aspect_ratio)
    assert scratch.aspect_ratio > 4 and (scratch.orientation_deg < 10 or scratch.orientation_deg > 170)
    assert 0 < result.defect_area_percent < 5


def test_adaptive_threshold_option_also_finds_defects() -> None:
    cfg = PipelineConfig.model_validate({"threshold": {"method": "adaptive"}})
    result = run_pipeline(add_blob(make_texture("sinusoid")), cfg)
    assert result.decision == "FAIL" and any(_hits(d, 200, 60) for d in result.defects)


def test_returns_all_stages_timings_and_histograms() -> None:
    result = run_pipeline(add_blob(make_texture()), PipelineConfig(max_side=256))
    assert list(result.stages) == EXPECTED_STAGES
    assert all(img.dtype == np.uint8 for img in result.stages.values())
    assert result.stages["overlay"].shape == (256, 256, 3)
    assert {"load_and_normalize", "enhance", "notch_filter", "extract_defects"} <= set(result.timings_ms)
    assert all(t >= 0 for t in result.timings_ms.values())
    assert result.histograms["before"].sum() == result.histograms["after"].sum() == 256 * 256


def test_color_input_and_fail_thresholds() -> None:
    gray = add_blob(make_texture())
    bgr = np.dstack([gray, gray, gray])
    cfg = PipelineConfig(max_side=256, max_defects=5, max_area_percent=50)
    result = run_pipeline(bgr, cfg)
    assert result.defects and result.decision == "PASS"  # defect found but within tolerance
