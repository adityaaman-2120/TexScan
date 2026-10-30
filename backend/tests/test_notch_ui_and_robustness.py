import cv2
import numpy as np
import pytest

from tests.conftest import add_blob, make_texture
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.notch import apply_frequency_mask, mask_to_filter, symmetrize_mask
from texscan.pipeline.runner import decide
from texscan.pipeline.types import Defect
from texscan.robustness import DEGRADATIONS, add_gaussian_noise, blur, jpeg_compress, shift_brightness, sweep


def _defect() -> Defect:
    return Defect(id=1, bbox=(0, 0, 5, 5), area=20, centroid=(2.0, 2.0), perimeter=15.0, aspect_ratio=1.0, solidity=1.0, orientation_deg=0.0)


def test_symmetrize_mask_adds_point_reflection_about_dc() -> None:
    mask = np.zeros((64, 64), np.float32)
    mask[32, 40] = 1  # 8 px right of DC (32, 32)
    mask[10, 20] = 1
    out = symmetrize_mask(mask)
    assert out[32, 24] == 1 and out[54, 44] == 1  # (-u, -v) partners
    assert out.sum() == 4 and out[32, 40] == out[10, 20] == 1
    assert np.array_equal(symmetrize_mask(out), out)  # idempotent


def test_symmetrize_mask_handles_odd_sizes_and_dc() -> None:
    mask = np.zeros((31, 33), np.float32)
    mask[15, 16] = 1  # the DC bin of an odd-sized spectrum maps to itself
    mask[15, 20] = 1
    out = symmetrize_mask(mask)
    assert out.shape == (31, 33) and out[15, 12] == 1 and out.sum() == 3


def test_mask_to_filter_rejects_drawn_region_and_its_mirror() -> None:
    drawn = np.zeros((128, 128), np.uint8)
    cv2.circle(drawn, (80, 64), 4, 255, -1)
    h = mask_to_filter(drawn, feather=2.0)
    assert h.dtype == np.float32 and 0 <= h.min() and h.max() == 1
    assert h[64, 80] == 0 and h[64, 48] == 0  # drawn disc and mirrored disc fully rejected
    assert h[64, 90] > 0.9 and h[0, 0] == 1  # soft edge, untouched far away
    assert np.array_equal(h[64, 48:49], h[64, 80:81])
    binary = mask_to_filter(drawn, feather=0)
    assert set(np.unique(binary)) == {0.0, 1.0}


def test_apply_frequency_mask_identity_and_removal() -> None:
    img = make_texture("sinusoid")
    assert np.allclose(apply_frequency_mask(img, np.ones(img.shape, np.float32)), img, atol=1e-3)
    drawn = np.zeros(img.shape, np.uint8)
    cv2.circle(drawn, (144, 128), 4, 255, -1)  # one of the two spectral peaks (period 16 -> +-16 bins)
    out = apply_frequency_mask(img, mask_to_filter(drawn, 1.0))
    assert out.std() < 0.2 * img.std() and abs(out.mean() - img.mean()) < 1


def test_decide_uses_both_limits() -> None:
    cfg = PipelineConfig(max_defects=1, max_area_percent=2.0)
    assert decide([], 0.0, cfg) == "PASS"
    assert decide([_defect()], 2.0, cfg) == "PASS"
    assert decide([_defect(), _defect()], 0.1, cfg) == "FAIL"
    assert decide([_defect()], 2.1, cfg) == "FAIL"


def test_gaussian_noise_has_requested_sigma_and_is_seeded() -> None:
    img = np.full((200, 200), 128, np.uint8)
    noisy = add_gaussian_noise(img, 10)
    assert noisy.dtype == np.uint8 and noisy.astype(float).std() == pytest.approx(10, rel=0.1)
    assert np.array_equal(noisy, add_gaussian_noise(img, 10))
    assert np.array_equal(add_gaussian_noise(img, 0), img)


def test_blur_brightness_jpeg() -> None:
    img = make_texture("grid")
    assert blur(img, 3).std() < img.std() and np.array_equal(blur(img, 0), img)
    bright = shift_brightness(img, 200)
    assert bright.max() == 255 and bright.min() >= 200 - 0 and shift_brightness(img, 0).tolist() == img.tolist()
    assert shift_brightness(img, -300).max() == 0
    small, large = jpeg_compress(img, 5), jpeg_compress(img, 95)
    assert small.shape == img.shape and np.abs(small.astype(int) - img).mean() > np.abs(large.astype(int) - img).mean()


def test_sweep_reports_each_level() -> None:
    cfg = PipelineConfig(max_side=256)
    img = add_blob(make_texture("sinusoid"))
    points = sweep(img, cfg, "gaussian_noise", [0, 60])
    assert [p["level"] for p in points] == [0, 60]
    assert points[0]["decision"] == "FAIL" and points[0]["defect_area_percent"] > 0
    assert {"level", "decision", "defect_count", "defect_area_percent", "psnr", "ssim", "file_bytes", "image"} == set(points[0])
    assert set(DEGRADATIONS) == {"gaussian_noise", "blur", "brightness", "jpeg_quality"}


def test_pipeline_result_unchanged_by_refactored_notch_filter() -> None:
    result = run_pipeline(add_blob(make_texture("sinusoid")), PipelineConfig(max_side=256))
    assert result.decision == "FAIL"
