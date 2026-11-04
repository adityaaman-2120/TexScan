import cv2
import numpy as np

from tests.conftest import make_texture
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.colour import colour_cutoff, colour_deviation, colour_k_needed, colour_mask

BROWN = (30, 60, 110)  # BGR, much darker than the cloth
RED_SAME_GRAY = (135, 158, 240)  # BGR, a different colour with the same gray level as the cloth (about 180)


def cloth(size: int = 256, seed: int = 0) -> np.ndarray:
    """Plain pale-blue cloth with mild noise."""
    base = np.empty((size, size, 3), np.float32)
    base[:] = (200, 185, 160)
    noise = np.random.default_rng(seed).normal(0, 2, (size, size, 1))
    return np.clip(base + noise, 0, 255).astype(np.uint8)


def with_spot(image: np.ndarray, centre: tuple[int, int] = (150, 170), radius: int = 12, colour: tuple[int, int, int] = BROWN) -> np.ndarray:
    out = image.copy()
    cv2.circle(out, centre, radius, colour, -1)
    return out


def test_deviation_is_zero_for_gray_input_and_small_on_plain_cloth() -> None:
    assert not colour_deviation(make_texture()).any()
    d = colour_deviation(cloth())
    assert d.shape == (256, 256) and d.dtype == np.float32
    assert d.max() < 12


def test_deviation_is_large_on_a_patch_of_another_colour() -> None:
    d = colour_deviation(with_spot(cloth()))
    assert d[170, 150] > 40  # centre of the spot (row 170, column 150)
    assert d[20, 20] < 12


def test_a_large_background_does_not_flag_the_cloth_itself() -> None:
    """The patch is a quarter of the picture's width, yet the cloth around it is still the reference."""
    d = colour_deviation(with_spot(cloth(), radius=30))
    assert d[170, 150] > 40 and d[20, 20] < 12


def test_cutoff_never_drops_below_the_floor() -> None:
    flat = np.zeros((50, 50), np.float32)
    assert colour_cutoff(flat, k=6.0, floor=12.0) == 12.0
    noisy = np.random.default_rng(0).normal(20, 5, (50, 50)).astype(np.float32)
    assert colour_cutoff(noisy, k=6.0, floor=1.0) > 20 + 6 * 4  # median + k * ~sigma


def test_mask_marks_the_spot_and_clears_the_border() -> None:
    m = colour_mask(colour_deviation(with_spot(cloth())), border=8)
    assert set(np.unique(m)) <= {0, 255}
    assert m[170, 150] == 255 and m[20, 20] == 0
    assert not m[:8].any() and not m[-8:].any() and not m[:, :8].any() and not m[:, -8:].any()
    assert not colour_mask(colour_deviation(cloth())).any()


def test_closing_joins_the_pieces_of_one_defect() -> None:
    img = cloth()
    for cx in (100, 112):  # two touching-ish blobs with a 4 px gap
        cv2.circle(img, (cx, 128), 5, BROWN, -1)
    d = colour_deviation(img, sigma=0.5)
    n_without, _ = cv2.connectedComponents(colour_mask(d, close_size=1))
    n_with, _ = cv2.connectedComponents(colour_mask(d, close_size=9))
    assert n_with < n_without


def test_k_needed_is_high_only_when_the_picture_has_a_stain() -> None:
    assert colour_k_needed(colour_deviation(with_spot(cloth()))) > 6 > colour_k_needed(colour_deviation(cloth()))


def test_stripes_without_a_colour_difference_are_not_defects() -> None:
    stripes = np.dstack([make_texture("sinusoid")[:, :200]] * 3)
    assert not colour_mask(colour_deviation(stripes), border=8).any()


def test_the_pipeline_finds_a_stain_the_texture_detector_misses() -> None:
    img = with_spot(cloth(), colour=RED_SAME_GRAY)  # invisible in gray, so only the colour cue can see it
    off = PipelineConfig.model_validate({"method": "gabor", "max_side": 256, "colour": {"enabled": False}})
    on = PipelineConfig.model_validate({"method": "gabor", "max_side": 256})
    assert run_pipeline(img, off).decision == "PASS"
    found = run_pipeline(img, on)
    assert found.decision == "FAIL" and any(d.bbox[0] < 150 < d.bbox[0] + d.bbox[2] and d.bbox[1] < 170 < d.bbox[1] + d.bbox[3] for d in found.defects)
    assert found.colour_score is not None and "mask_colour" in found.stages


def test_the_pipeline_passes_plain_cloth_and_skips_gray_input_and_templates() -> None:
    cfg = PipelineConfig.model_validate({"method": "gabor", "max_side": 256})
    assert run_pipeline(cloth(), cfg).decision == "PASS"
    assert run_pipeline(make_texture(), cfg).colour_score is None or not run_pipeline(make_texture(), cfg).colour_score.any()
    reference = cloth(seed=3)
    tmpl = PipelineConfig.model_validate({"method": "golden_template", "max_side": 256})
    assert run_pipeline(with_spot(cloth()), tmpl, reference).colour_score is None
