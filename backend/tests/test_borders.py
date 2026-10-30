import numpy as np
import pytest

from tests.conftest import add_blob, make_texture
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.borders import MIN_CONTENT, content_box, trim_borders


def pillarbox(picture: np.ndarray, left: int, right: int) -> np.ndarray:
    gray = picture if picture.ndim == 3 else np.dstack([picture] * 3)
    return np.hstack([np.zeros((gray.shape[0], left, 3), np.uint8), gray, np.zeros((gray.shape[0], right, 3), np.uint8)])


@pytest.fixture
def picture() -> np.ndarray:
    return make_texture("sinusoid")[:200, :150]


def test_finds_pillarbox_bars(picture: np.ndarray) -> None:
    framed = pillarbox(picture, 40, 60)
    assert content_box(framed) == (40, 0, 40 + 150, 200)


def test_finds_letterbox_bars(picture: np.ndarray) -> None:
    framed = np.vstack([np.zeros((30, 150, 3), np.uint8), np.dstack([picture] * 3), np.zeros((10, 150, 3), np.uint8)])
    assert content_box(framed) == (0, 30, 150, 230)


def test_leaves_a_picture_without_borders_alone(picture: np.ndarray) -> None:
    assert content_box(picture) == (0, 0, 150, 200)


def test_a_mostly_dark_frame_is_not_trimmed_into_a_sliver() -> None:
    dark = np.zeros((100, 100), np.uint8)
    dark[40:45, 40:45] = 200  # a tiny lit patch: keep the whole frame
    assert content_box(dark) == (0, 0, 100, 100)
    assert content_box(np.zeros((50, 50, 3), np.uint8)) == (0, 0, 50, 50)
    assert MIN_CONTENT == 0.25


def test_trim_returns_a_copy_and_does_not_touch_the_input(picture: np.ndarray) -> None:
    framed = pillarbox(picture, 20, 20)
    before = framed.copy()
    cropped, box = trim_borders(framed)
    assert cropped.shape == (200, 150, 3) and box == (20, 0, 170, 200)
    assert np.array_equal(framed, before)
    cropped[:] = 7
    assert np.array_equal(framed, before)


def test_pipeline_ignores_the_bars_only_when_asked(picture: np.ndarray) -> None:
    clean = make_texture("sinusoid")
    framed = pillarbox(clean[:, :200], 150, 150)
    assert run_pipeline(framed, PipelineConfig(max_side=256)).decision == "FAIL"  # the bars are judged as a defect
    result = run_pipeline(framed, PipelineConfig(max_side=256, trim_borders=True))
    assert result.decision == "PASS" and result.crop == (150, 0, 350, clean.shape[0])
    assert "trim_borders" in result.timings_ms


def test_pipeline_still_finds_a_defect_inside_the_trimmed_picture() -> None:
    texture = add_blob(make_texture("sinusoid")[:, :200], (100, 100), 12)
    result = run_pipeline(pillarbox(texture, 150, 150), PipelineConfig(max_side=256, trim_borders=True))
    assert result.decision == "FAIL" and result.defects


def test_center_crop_keeps_the_middle_and_reports_the_box() -> None:
    from texscan.pipeline.borders import center_crop

    image = np.arange(100 * 200, dtype=np.uint32).reshape(100, 200).astype(np.uint8)
    cropped, box = center_crop(image, 0.5)
    assert box == (50, 25, 150, 75) and cropped.shape == (50, 100)
    assert np.array_equal(cropped, image[25:75, 50:150])
    cropped[:] = 0
    assert image.any()  # a copy
    assert center_crop(image, 1.0)[1] == (0, 0, 200, 100)
    assert center_crop(image, 3.0)[1] == (0, 0, 200, 100)


def test_pipeline_composes_trim_and_center_crop(picture: np.ndarray) -> None:
    framed = pillarbox(make_texture("sinusoid")[:, :200], 100, 100)  # picture occupies x 100..300 of a 400 wide frame
    result = run_pipeline(framed, PipelineConfig(max_side=256, trim_borders=True, center_fraction=0.5))
    assert result.crop == (150, 64, 250, 192)  # the middle half of the picture, in frame coordinates
    assert run_pipeline(framed, PipelineConfig(max_side=256, center_fraction=0.5)).crop == (100, 64, 300, 192)
    assert run_pipeline(framed, PipelineConfig(max_side=256)).crop == (0, 0, 0, 0)  # untouched
