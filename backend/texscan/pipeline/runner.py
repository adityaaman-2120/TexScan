from dataclasses import dataclass
from typing import Literal

import numpy as np

from texscan.pipeline.classify import classify_defects
from texscan.pipeline.config import PipelineConfig
from texscan.pipeline.defects import extract_defects
from texscan.pipeline.denoise import denoise
from texscan.pipeline.detectors import DETECTORS
from texscan.pipeline.enhance import Histogram, enhance
from texscan.pipeline.load import load_and_normalize, resize_longest
from texscan.pipeline.overlay import edges_overlay
from texscan.pipeline.recorder import Recorder
from texscan.pipeline.segment import morphology_cleanup
from texscan.pipeline.types import Defect, FloatImage, Image, Peaks


@dataclass
class PipelineResult:
    decision: Literal["PASS", "FAIL"]
    defects: list[Defect]
    defect_area_percent: float
    stages: dict[str, Image]  # insertion order = processing order
    timings_ms: dict[str, float]
    histograms: dict[str, Histogram]
    peaks: Peaks  # (N, 2); empty unless method == "fft"
    score_map: FloatImage  # continuous anomaly score before thresholding (used by auto-tune)


def decide(defects: list[Defect], defect_area_percent: float, cfg: PipelineConfig) -> Literal["PASS", "FAIL"]:
    """FAIL when there are more than max_defects defects or more than max_area_percent of the image is defective."""
    failed = len(defects) > cfg.max_defects or defect_area_percent > cfg.max_area_percent
    return "FAIL" if failed else "PASS"


def _preprocess(rec: Recorder, gray: Image, cfg: PipelineConfig) -> tuple[Image, dict[str, Histogram]]:
    denoised = rec.step("denoise", denoise, gray, **cfg.denoise.model_dump())
    enhanced, before, after = rec.step("enhance", enhance, denoised, **cfg.enhance.model_dump())
    rec.stages.update(denoised=denoised, enhanced=enhanced)
    return enhanced, {"before": before, "after": after}


def _prepare_reference(reference: Image, cfg: PipelineConfig) -> Image:
    gray = load_and_normalize(reference, cfg.max_side)
    return enhance(denoise(gray, **cfg.denoise.model_dump()), **cfg.enhance.model_dump())[0]


def run_pipeline(
    image: Image, config: PipelineConfig | None = None, reference: Image | None = None
) -> PipelineResult:
    """Run every stage in order with the method chosen by config.method, keeping each intermediate image.

    reference (a known-good image) is only used by method 'golden_template'.
    """
    cfg = config or PipelineConfig()
    rec = Recorder()
    gray = rec.step("load_and_normalize", load_and_normalize, image, cfg.max_side)
    original = resize_longest(image, cfg.max_side)
    rec.stages.update(original=original, gray=gray)
    enhanced, histograms = _preprocess(rec, gray, cfg)
    ref = _prepare_reference(reference, cfg) if reference is not None else None
    detection = DETECTORS[cfg.method](rec, enhanced, cfg, ref)
    mask = rec.step("morphology_cleanup", morphology_cleanup, detection.mask, **cfg.morphology.model_dump())
    rec.stages["mask_clean"] = mask
    defects = rec.step("extract_defects", extract_defects, mask, gray)
    defects = rec.step("classify_defects", classify_defects, defects)
    rec.stages["overlay"] = rec.step("edges_overlay", edges_overlay, original, mask)
    percent = 100.0 * float(np.count_nonzero(mask)) / mask.size
    return PipelineResult(
        decision=decide(defects, percent, cfg),
        defects=defects,
        defect_area_percent=percent,
        stages=rec.stages,
        timings_ms=rec.timings_ms,
        histograms=histograms,
        peaks=detection.peaks,
        score_map=detection.score,
    )
