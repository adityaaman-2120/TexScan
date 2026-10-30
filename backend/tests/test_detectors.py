import numpy as np
import pytest

from tests.conftest import add_blob, make_texture
from texscan.pipeline import PipelineConfig
from texscan.pipeline.detectors import DETECTORS, Detection, detect_fft, detect_gabor, detect_local_stats, detect_template, gabor_margin, score_margin
from texscan.pipeline.recorder import Recorder

BLOB = (128, 160, 14)


@pytest.fixture
def clean() -> np.ndarray:
    return make_texture("sinusoid")


@pytest.fixture
def defective(clean: np.ndarray) -> np.ndarray:
    return add_blob(clean, BLOB[:2], BLOB[2])


def run(detector, image: np.ndarray, reference: np.ndarray | None = None, method: str = "fft") -> tuple[Detection, Recorder]:  # type: ignore[no-untyped-def]
    rec = Recorder()
    cfg = PipelineConfig(method=method)  # type: ignore[arg-type]
    before = image.copy()
    detection = detector(rec, image, cfg, reference)
    assert np.array_equal(image, before), "a detector must not modify its input"
    return detection, rec


def test_registry_has_every_method() -> None:
    assert set(DETECTORS) == {"fft", "gabor", "golden_template", "local_statistics"}


@pytest.mark.parametrize(
    ("detector", "method", "needs_reference", "stage"),
    [(detect_fft, "fft", False, "residual"), (detect_gabor, "gabor", False, "gabor_energy"), (detect_local_stats, "local_statistics", False, "local_mean"), (detect_template, "golden_template", True, "aligned_reference")],
)
def test_detector_returns_a_binary_mask_the_size_of_the_image(detector, method, needs_reference, stage, clean, defective) -> None:  # type: ignore[no-untyped-def]
    reference = make_texture("sinusoid", seed=9) if needs_reference else None
    detection, rec = run(detector, defective, reference, method)
    assert detection.mask.shape == defective.shape and detection.mask.dtype == np.uint8
    assert set(np.unique(detection.mask)) <= {0, 255}
    assert detection.score.shape == defective.shape
    assert stage in rec.stages and "mask_raw" in rec.stages and rec.timings_ms


@pytest.mark.parametrize(("detector", "method"), [(detect_fft, "fft"), (detect_gabor, "gabor"), (detect_local_stats, "local_statistics")])
def test_detector_finds_the_blob_and_stays_quiet_on_a_clean_image(detector, method, clean, defective) -> None:  # type: ignore[no-untyped-def]
    found, _ = run(detector, defective, method=method)
    quiet, _ = run(detector, clean, method=method)
    row, col, radius = BLOB
    assert found.mask[row - radius : row + radius, col - radius : col + radius].any()
    assert (quiet.mask > 0).mean() < 0.01


def test_fft_detector_reports_periodic_peaks_and_the_others_do_not(clean) -> None:  # type: ignore[no-untyped-def]
    assert len(run(detect_fft, clean)[0].peaks) > 0
    assert len(run(detect_gabor, clean, method="gabor")[0].peaks) == 0


def test_template_detector_needs_a_reference(clean) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError, match="reference"):
        run(detect_template, clean, None, "golden_template")


def test_template_detector_sees_a_defect_missing_from_the_reference(clean, defective) -> None:  # type: ignore[no-untyped-def]
    detection, _ = run(detect_template, defective, clean, "golden_template")
    row, col, radius = BLOB
    assert detection.mask[row - radius : row + radius, col - radius : col + radius].any()


def test_margins_grow_with_the_gabor_wavelengths_and_only_gabor_uses_them() -> None:
    small, large = PipelineConfig(method="gabor"), PipelineConfig(method="gabor")
    large.gabor.wavelengths = (4, 8, 32)
    assert gabor_margin(large) > gabor_margin(small) >= small.threshold.border
    assert score_margin(small) == gabor_margin(small)
    assert score_margin(PipelineConfig(method="fft")) == PipelineConfig().threshold.border
