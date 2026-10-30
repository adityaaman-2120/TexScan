from functools import lru_cache

import cv2
import numpy as np
import pytest

from tests.conftest import add_blob, add_scratch, make_texture
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.gabor import gabor_bank, gabor_energy_maps, gabor_score
from texscan.pipeline.local_stats import local_mean_var, local_stats_score
from texscan.pipeline.stats import flag_outliers, robust_zscore
from texscan.pipeline.template import abs_difference, align_template
from texscan.pipeline.types import Defect, Image

METHODS = ["fft", "gabor", "golden_template", "local_statistics"]
SIZE_CFG = {"max_side": 256, "local_stats": {"window": 16}}  # 16 px = one texture period


def _cfg(method: str) -> PipelineConfig:
    return PipelineConfig.model_validate({"method": method, **SIZE_CFG})


def _near(defect: Defect, x: int, y: int, pad: int = 6) -> bool:
    bx, by, bw, bh = defect.bbox
    return bx - pad <= x <= bx + bw + pad and by - pad <= y <= by + bh + pad


def test_robust_zscore_ignores_outliers() -> None:
    x = np.concatenate([np.random.default_rng(0).normal(100, 2, 1000), [500.0]])
    z = robust_zscore(x)
    assert abs(np.median(z)) < 0.01 and z[-1] > 50 and abs(z[:-1]).max() < 5


def test_robust_zscore_floor_stops_noise_amplification() -> None:
    x = 100 + np.random.default_rng(0).normal(0, 1e-4, 500)
    assert np.abs(robust_zscore(x, rel_floor=0.05)).max() < 0.01


def test_flag_outliers_threshold_and_border() -> None:
    score = np.zeros((20, 20), np.float32)
    score[0, 0] = score[10, 10] = 9
    mask = flag_outliers(score, k=4, border=2)
    assert mask[10, 10] == 255 and mask[0, 0] == 0 and mask.sum() == 255


def test_gabor_bank_size_and_zero_mean() -> None:
    bank = gabor_bank(4, (4, 8, 16))
    assert len(bank) == 12
    assert all(abs(even.sum()) < 1e-3 and even.shape == odd.shape for even, odd in bank)


def test_gabor_energy_follows_texture_orientation() -> None:
    maps = gabor_energy_maps(make_texture("sinusoid"), 4, (16,), 4.0)  # vertical stripes, period 16
    means = maps[:, 40:-40, 40:-40].mean(axis=(1, 2))
    assert maps.shape == (4, 256, 256) and maps.dtype == np.float32
    assert int(np.argmax(means)) == 0 and means[0] > 3 * means[1:].max()


def test_gabor_score_peaks_at_defect() -> None:
    maps = gabor_energy_maps(add_blob(make_texture("sinusoid")), 4, (8, 16), 4.0)
    score = gabor_score(maps)
    assert score[60, 200] > 4 and np.median(score) < 3


def test_local_mean_var_values() -> None:
    img = np.full((40, 40), 100, np.uint8)
    img[:, 20:] = 200
    mean, var = local_mean_var(img, 5)
    assert mean[20, 5] == pytest.approx(100) and var[20, 5] == pytest.approx(0, abs=1e-3)
    assert mean[20, 20] == pytest.approx(160) and var[20, 20] == pytest.approx(2400)  # window straddles the edge


def test_local_stats_score_flags_odd_window() -> None:
    rng = np.random.default_rng(0)
    img = rng.normal(120, 4, (100, 100)).clip(0, 255).astype(np.uint8)
    img[40:60, 40:60] = rng.integers(0, 255, (20, 20))  # much noisier patch
    score = local_stats_score(*local_mean_var(img, 7))
    assert score[50, 50] > 4 and np.median(score) < 1.5


def test_align_template_recovers_known_shift_and_rotation() -> None:
    rng = np.random.default_rng(3)
    ref = cv2.GaussianBlur(rng.integers(0, 255, (256, 256)).astype(np.uint8), (0, 0), 2)
    ref = cv2.normalize(ref, None, 0, 255, cv2.NORM_MINMAX)
    warp = cv2.getRotationMatrix2D((128, 128), 5, 1.0)
    warp[:, 2] += (6, -4)
    test = cv2.warpAffine(ref, warp, (256, 256), borderMode=cv2.BORDER_REPLICATE)
    aligned, homography, inliers = align_template(test, ref)
    assert inliers >= 15 and np.allclose(homography[:2], warp, atol=0.05 + 0.02 * np.abs(warp[:, 2]).max())
    err_before = np.abs(test.astype(int) - ref)[30:-30, 30:-30].mean()
    err_after = np.abs(test.astype(int) - aligned)[30:-30, 30:-30].mean()
    assert err_after < 0.3 * err_before


def test_align_template_falls_back_to_identity_on_blank() -> None:
    blank = np.full((64, 64), 90, np.uint8)
    aligned, homography, inliers = align_template(blank, np.full((32, 48), 90, np.uint8))
    assert inliers == 0 and np.array_equal(homography, np.eye(3)) and aligned.shape == (64, 64)


def test_abs_difference_ignores_brightness_offset() -> None:
    a = np.random.default_rng(0).integers(50, 150, (30, 30)).astype(np.uint8)
    assert abs_difference(a + 20, a).max() < 1e-3
    b = a.copy()
    b[10, 10] = 250
    assert abs_difference(b, a)[10, 10] > 90


@pytest.mark.parametrize("method", METHODS)
def test_method_returns_stages_and_masks(method: str) -> None:
    result = run_pipeline(make_texture(), _cfg(method), make_texture(seed=9))
    assert {"original", "gray", "enhanced", "mask_raw", "mask_clean", "overlay"} <= set(result.stages)
    assert list(result.stages)[-2:] == ["mask_clean", "overlay"]
    assert result.stages["mask_raw"].shape == (256, 256) and result.timings_ms


def test_golden_template_requires_reference() -> None:
    with pytest.raises(ValueError, match="reference"):
        run_pipeline(make_texture(), _cfg("golden_template"))


# --- native 1024 px scenes (period 16 px): the defaults are tuned for this scale ----------------
N = 1024
SCRATCH = (240, 510, 520, 4)  # x, y, w, h
BLOB = (800, 240, 30)  # cx, cy, radius


@lru_cache
def _scene(kind: str, defect: str) -> tuple[Image, Image]:
    clean = make_texture(kind, N, seed=0, cycles=64)
    reference = make_texture(kind, N, seed=9, cycles=64)
    if defect == "scratch":
        return add_scratch(clean, SCRATCH[1], SCRATCH[0], SCRATCH[0] + SCRATCH[2], 230, SCRATCH[3]), reference
    if defect == "blob":
        return add_blob(clean, (BLOB[1], BLOB[0]), BLOB[2]), reference
    return clean, reference


def _overlaps(defect: Defect, x: int, y: int, w: int, h: int) -> bool:
    bx, by, bw, bh = defect.bbox
    return bx < x + w and x < bx + bw and by < y + h and y < by + bh


def _inspect(method: str, kind: str, defect: str):  # type: ignore[no-untyped-def]
    image, reference = _scene(kind, defect)
    return run_pipeline(image, PipelineConfig.model_validate({"method": method, "local_stats": {"window": 16}}), reference)


@pytest.mark.parametrize("kind", ["sinusoid", "grid"])
@pytest.mark.parametrize("method", METHODS)
def test_clean_texture_passes(method: str, kind: str) -> None:
    result = _inspect(method, kind, "none")
    assert result.decision == "PASS", [d.bbox for d in result.defects]


@pytest.mark.parametrize("kind", ["sinusoid", "grid"])
@pytest.mark.parametrize("method", METHODS)
def test_finds_blob(method: str, kind: str) -> None:
    result = _inspect(method, kind, "blob")
    cx, cy, r = BLOB
    assert result.decision == "FAIL"
    assert any(_overlaps(d, cx - r, cy - r, 2 * r, 2 * r) for d in result.defects)
    assert not any(_overlaps(d, 0, 0, 200, 200) for d in result.defects)  # nothing flagged far away


@pytest.mark.parametrize("kind", ["sinusoid", "grid"])
@pytest.mark.parametrize("method", METHODS)
def test_finds_thin_scratch(method: str, kind: str) -> None:
    """Local statistics needs a window about as wide as the scratch spacing: the default 31 px misses a 4 px line."""
    result = _inspect(method, kind, "scratch")
    assert result.decision == "FAIL"
    assert any(_overlaps(d, *SCRATCH) for d in result.defects)
