import cv2
import numpy as np
import pytest

from tests.conftest import make_texture
from texscan.pipeline.notch import apply_frequency_mask, mask_to_filter, radial_filter

SHAPE = (128, 128)
CENTER = (64, 64)


def gain_at(h: np.ndarray, dy: int, dx: int) -> float:
    return float(h[CENTER[0] + dy, CENTER[1] + dx])


@pytest.mark.parametrize("response", ["ideal", "butterworth", "gaussian"])
def test_lowpass_passes_dc_and_cuts_high_frequencies(response: str) -> None:
    h = radial_filter(SHAPE, "lowpass", response, cutoff=20)  # type: ignore[arg-type]
    assert gain_at(h, 0, 0) == pytest.approx(1.0)
    assert gain_at(h, 0, 60) < 0.05
    assert h.dtype == np.float32 and 0 <= h.min() and h.max() <= 1


def test_cutoff_gain_of_each_response() -> None:
    assert gain_at(radial_filter(SHAPE, "lowpass", "ideal", 20), 0, 20) == 1.0  # inclusive edge
    assert gain_at(radial_filter(SHAPE, "lowpass", "ideal", 20), 0, 21) == 0.0
    assert gain_at(radial_filter(SHAPE, "lowpass", "butterworth", 20, order=3), 0, 20) == pytest.approx(0.5)
    assert gain_at(radial_filter(SHAPE, "lowpass", "gaussian", 20), 0, 20) == pytest.approx(np.exp(-0.5), rel=1e-4)


def test_butterworth_order_sharpens_the_transition() -> None:
    soft = radial_filter(SHAPE, "lowpass", "butterworth", 20, order=1)
    sharp = radial_filter(SHAPE, "lowpass", "butterworth", 20, order=8)
    assert gain_at(sharp, 0, 30) < gain_at(soft, 0, 30) and gain_at(sharp, 0, 12) > gain_at(soft, 0, 12)


@pytest.mark.parametrize("response", ["ideal", "butterworth", "gaussian"])
def test_highpass_is_the_complement_and_sharpen_adds_edges_back(response: str) -> None:
    low = radial_filter(SHAPE, "lowpass", response, 20)  # type: ignore[arg-type]
    high = radial_filter(SHAPE, "highpass", response, 20)  # type: ignore[arg-type]
    sharp = radial_filter(SHAPE, "sharpen", response, 20, boost=2.0)  # type: ignore[arg-type]
    assert np.allclose(low + high, 1.0, atol=1e-6)
    assert gain_at(high, 0, 0) == pytest.approx(0.0)
    assert gain_at(sharp, 0, 0) == pytest.approx(1.0) and sharp.max() == pytest.approx(3.0, abs=0.01)
    assert (sharp >= 1.0 - 1e-6).all()


def test_filters_are_radially_symmetric() -> None:
    h = radial_filter(SHAPE, "lowpass", "gaussian", 17)
    assert gain_at(h, 10, 0) == pytest.approx(gain_at(h, 0, 10)) == pytest.approx(gain_at(h, -10, 0))
    assert gain_at(h, 6, 8) == pytest.approx(gain_at(h, 0, 10))


def test_rejects_bad_cutoff() -> None:
    with pytest.raises(ValueError, match="cutoff"):
        radial_filter(SHAPE, "lowpass", "gaussian", 0)


def test_lowpass_smooths_highpass_removes_the_average_sharpen_amplifies() -> None:
    img = make_texture("sinusoid")
    noisy = np.clip(img.astype(float) + np.random.default_rng(1).normal(0, 25, img.shape), 0, 255).astype(np.uint8)
    low = apply_frequency_mask(noisy, radial_filter(noisy.shape, "lowpass", "gaussian", 24))
    high = apply_frequency_mask(noisy, radial_filter(noisy.shape, "highpass", "gaussian", 24))
    sharp = apply_frequency_mask(noisy, radial_filter(noisy.shape, "sharpen", "gaussian", 24))
    assert low.std() < noisy.std()  # noise energy removed
    assert abs(high.mean()) < 1 < abs(float(noisy.mean()))  # DC removed
    assert sharp.std() > noisy.std()  # edges amplified


def test_symmetric_flag_changes_the_filter_but_not_the_default() -> None:
    drawn = np.zeros((64, 64), np.uint8)
    cv2.circle(drawn, (44, 32), 3, 255, -1)
    both = mask_to_filter(drawn, feather=0)
    one = mask_to_filter(drawn, feather=0, symmetric=False)
    assert both[32, 44] == 0 and both[32, 20] == 0  # mirrored through the centre
    assert one[32, 44] == 0 and one[32, 20] == 1  # only the drawn side
    assert np.array_equal(both, mask_to_filter(drawn, feather=0, symmetric=True))


def test_one_sided_notch_has_a_real_but_weaker_effect() -> None:
    img = make_texture("sinusoid")
    drawn = np.zeros(img.shape, np.uint8)
    cv2.circle(drawn, (144, 128), 4, 255, -1)  # one of the two +-16 peaks
    full = apply_frequency_mask(img, mask_to_filter(drawn, 1.0, symmetric=True))
    half = apply_frequency_mask(img, mask_to_filter(drawn, 1.0, symmetric=False))
    assert full.std() < half.std() < img.std()  # half strength sits in between
