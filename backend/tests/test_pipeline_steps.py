import cv2
import numpy as np
import pytest

from tests.conftest import add_scratch, make_texture
from texscan.pipeline.defects import extract_defects
from texscan.pipeline.denoise import denoise
from texscan.pipeline.enhance import enhance, histogram
from texscan.pipeline.load import load_and_normalize, resize_longest, to_gray
from texscan.pipeline.notch import notch_filter, notch_mask
from texscan.pipeline.overlay import edges_overlay
from texscan.pipeline.segment import morphology_cleanup, remove_small_components, residual_to_mask
from texscan.pipeline.spectrum import detect_periodic_peaks, fft_spectrum, magnitude_spectrum, mark_peaks
from texscan.pipeline.utils import to_uint8


def test_to_uint8_stretches_and_handles_constant() -> None:
    out = to_uint8(np.array([[-1.0, 0.0, 1.0]]))
    assert out.tolist() == [[0, 128, 255]]
    assert to_uint8(np.full((3, 3), 7.0)).max() == 0


def test_to_gray() -> None:
    bgr = np.zeros((4, 4, 3), np.uint8)
    bgr[..., 1] = 200
    gray = to_gray(bgr)
    assert gray.shape == (4, 4) and abs(int(gray[0, 0]) - round(0.587 * 200)) <= 1
    assert to_gray(gray) is not gray


def test_resize_longest_keeps_aspect_ratio() -> None:
    out = resize_longest(np.zeros((500, 2000), np.uint8), 1024)
    assert out.shape == (256, 1024)
    assert resize_longest(np.zeros((10, 20, 3), np.uint8), 40).shape == (20, 40, 3)


def test_load_and_normalize_gray_and_resized() -> None:
    out = load_and_normalize(np.full((300, 600, 3), 90, np.uint8), 1024)
    assert out.ndim == 2 and max(out.shape) == 1024 and out.dtype == np.uint8
    with pytest.raises(ValueError):
        load_and_normalize(np.zeros((8, 8), np.float32))


def test_denoise_median_removes_salt_noise() -> None:
    img = np.full((32, 32), 100, np.uint8)
    img[16, 16] = 255
    assert denoise(img, "median", 3)[16, 16] == 100


def test_denoise_gaussian_smooths_and_validates() -> None:
    img = np.zeros((32, 32), np.uint8)
    img[16, 16] = 255
    out = denoise(img, "gaussian", 5)
    assert out[16, 16] < 255 and out[16, 17] > 0
    assert np.array_equal(denoise(img, "none"), img)
    with pytest.raises(ValueError):
        denoise(img, "median", 4)


def test_histogram_counts_pixels() -> None:
    img = np.array([[0, 0], [255, 7]], np.uint8)
    h = histogram(img)
    assert h.shape == (256,) and h[0] == 2 and h[255] == 1 and h.sum() == 4


@pytest.mark.parametrize("method", ["clahe", "hist_eq", "none"])
def test_enhance_returns_image_and_histograms(method: str) -> None:
    img = np.random.default_rng(0).integers(100, 140, (64, 64)).astype(np.uint8)
    out, before, after = enhance(img, method)  # type: ignore[arg-type]
    assert out.shape == img.shape and before.sum() == after.sum() == img.size
    if method != "none":
        assert out.max() - out.min() > img.max() - img.min()


def test_fft_spectrum_peaks_at_texture_frequency() -> None:
    spec, freq = fft_spectrum(make_texture("sinusoid"))
    assert spec.dtype == np.uint8 and spec.max() == 255 and freq.shape == spec.shape
    row, col = np.unravel_index(np.argmax(magnitude_spectrum(freq)), spec.shape)
    assert row == 128 and abs(col - 128) == 16


def test_detect_periodic_peaks_finds_sinusoid_and_skips_dc() -> None:
    _, freq = fft_spectrum(make_texture("sinusoid"))
    peaks = detect_periodic_peaks(magnitude_spectrum(freq))
    found = {tuple(p) for p in peaks.tolist()}
    assert {(128, 112), (128, 144)} <= found
    assert all(np.hypot(r - 128, c - 128) > 10 for r, c in found)


def test_detect_periodic_peaks_empty_for_flat_noise() -> None:
    noise = np.random.default_rng(1).normal(100, 5, (128, 128)).clip(0, 255).astype(np.uint8)
    _, freq = fft_spectrum(noise)
    assert len(detect_periodic_peaks(magnitude_spectrum(freq), threshold_sigma=8)) == 0


def test_mark_peaks_draws_red() -> None:
    out = mark_peaks(np.zeros((40, 40), np.uint8), np.array([[20, 20]]))
    assert out.shape == (40, 40, 3) and (out[..., 2] == 255).any() and (out[..., 0] == 0).all()


def test_notch_mask_rejects_peak_and_mirror() -> None:
    mask = notch_mask((64, 64), np.array([[32, 40]]), sigma=2.0)
    assert mask[32, 40] < 0.01 and mask[32, 24] < 0.01  # peak and its mirror (-u, -v)
    assert mask[0, 0] == 1.0 and 0 <= mask.min() and mask.max() <= 1


def test_notch_filter_removes_texture_but_keeps_scratch() -> None:
    img = add_scratch(make_texture("sinusoid"))
    _, freq = fft_spectrum(img)
    peaks = detect_periodic_peaks(magnitude_spectrum(freq))
    filtered, mask = notch_filter(img, peaks)
    assert filtered.dtype == np.float32 and mask.shape == img.shape
    background = filtered[20:100, 20:100]
    assert background.std() < 0.15 * img[20:100, 20:100].std()
    assert filtered[128:130, 80:170].mean() - np.median(filtered) > 30


def test_residual_to_mask_otsu_and_adaptive_find_spot() -> None:
    res = np.zeros((100, 100), np.float32)
    res[40:50, 40:50] = 80
    for method in ("otsu", "adaptive"):
        mag, mask = residual_to_mask(res, method, border=0)  # type: ignore[arg-type]
        assert mag.dtype == np.uint8 and mask[45, 45] == 255 and mask[5, 5] == 0


def test_residual_to_mask_noise_floor_gives_empty_mask() -> None:
    res = np.random.default_rng(0).normal(0, 2, (100, 100)).astype(np.float32)
    assert residual_to_mask(res)[1].max() == 0


def test_remove_small_components() -> None:
    mask = np.zeros((50, 50), np.uint8)
    mask[5:7, 5:7] = 255
    mask[20:40, 20:40] = 255
    out = remove_small_components(mask, 50)
    assert out[5, 5] == 0 and out[30, 30] == 255


def test_morphology_cleanup_removes_specks_and_fills_holes() -> None:
    mask = np.zeros((60, 60), np.uint8)
    mask[10:40, 10:40] = 255
    mask[25, 25] = 0  # pinhole
    mask[50, 50] = 255  # speck
    out = morphology_cleanup(mask, 3, 50)
    assert out[25, 25] == 255 and out[50, 50] == 0 and out[20, 20] == 255


def test_extract_defects_measures_shapes() -> None:
    mask = np.zeros((100, 100), np.uint8)
    mask[10:14, 20:80] = 255  # horizontal bar 60 x 4
    cv2.circle(mask, (50, 70), 10, 255, -1)
    bar, disc = sorted(extract_defects(mask), key=lambda d: d.centroid[1])
    assert bar.bbox == (20, 10, 60, 4) and bar.area == 240
    assert bar.aspect_ratio > 5 and min(bar.orientation_deg, 180 - bar.orientation_deg) < 1
    assert bar.solidity > 0.95 and abs(bar.centroid[0] - 49.5) < 0.1
    assert disc.aspect_ratio < 1.1 and 300 < disc.area < 330 and disc.perimeter > 50


def test_extract_defects_orientation_vertical_and_diagonal() -> None:
    mask = np.zeros((100, 100), np.uint8)
    mask[10:60, 20:23] = 255
    cv2.line(mask, (50, 10), (90, 50), 255, 3)  # down-right on screen
    vertical, diagonal = sorted(extract_defects(mask), key=lambda d: d.centroid[0])
    assert abs(vertical.orientation_deg - 90) < 2
    assert abs(diagonal.orientation_deg - 45) < 3


def test_extract_defects_empty_mask() -> None:
    assert extract_defects(np.zeros((10, 10), np.uint8)) == []


def test_edges_overlay_draws_red_outline_on_gray_and_color() -> None:
    mask = np.zeros((50, 50), np.uint8)
    mask[10:30, 10:30] = 255
    for original in (np.full((50, 50), 120, np.uint8), np.full((50, 50, 3), 120, np.uint8)):
        out = edges_overlay(original, mask)
        assert out.shape == (50, 50, 3)
        assert (out[..., 2] == 255).any() and np.array_equal(out[45, 45], [120, 120, 120])
    assert np.array_equal(edges_overlay(original, mask)[0, 0], [120, 120, 120])


# ---- bit planes ----


def test_bit_planes_are_binary_and_extract_the_right_bit() -> None:
    from texscan.pipeline.bitplanes import bit_planes

    gray = np.array([[0, 1, 2, 4], [128, 129, 255, 170]], dtype=np.uint8)
    planes = bit_planes(gray)
    assert len(planes) == 8 and all(p.shape == gray.shape and p.dtype == np.uint8 for p in planes)
    assert all(set(np.unique(p)) <= {0, 255} for p in planes)
    assert planes[0].tolist() == [[0, 255, 0, 0], [0, 255, 255, 0]]  # LSB
    assert planes[7].tolist() == [[0, 0, 0, 0], [255, 255, 255, 255]]  # MSB
    assert planes[1].tolist() == [[0, 0, 255, 0], [0, 0, 255, 255]]


def test_bit_planes_add_back_up_to_the_image_and_do_not_touch_the_input() -> None:
    from texscan.pipeline.bitplanes import bit_planes

    gray = np.random.default_rng(3).integers(0, 256, (16, 24), dtype=np.uint8)
    before = gray.copy()
    rebuilt = sum((p // 255).astype(np.uint16) << k for k, p in enumerate(bit_planes(gray)))
    assert np.array_equal(rebuilt, gray) and np.array_equal(gray, before)


def test_bit_planes_reject_color_and_float_input() -> None:
    from texscan.pipeline.bitplanes import bit_planes

    with pytest.raises(ValueError):
        bit_planes(np.zeros((4, 4, 3), np.uint8))
    with pytest.raises(ValueError):
        bit_planes(np.zeros((4, 4), np.float32))
