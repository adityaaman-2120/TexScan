"""Auto-tune: choose a threshold and min_area from known-good images of one material.

Not part of pipeline/ because it orchestrates many pipeline runs and is statistics over images, not one image step.
"""

import math

import numpy as np
from pydantic import BaseModel

from texscan.pipeline import PipelineConfig, PipelineResult, run_pipeline
from texscan.pipeline.detectors import score_margin
from texscan.pipeline.types import Image

MIN_IMAGES, MAX_IMAGES = 5, 20
_SAMPLES_PER_IMAGE = 200_000

# method -> (config section, field, lowest sane value). The tuned field is the score cut-off of that method.
TUNABLE: dict[str, tuple[str, str, float]] = {
    "fft": ("threshold", "min_threshold", 1.0),  # gray levels of the smoothed residual
    "gabor": ("gabor", "k", 3.0),  # robust-z units
    "local_statistics": ("local_stats", "k", 3.0),  # robust-z units
}


HISTOGRAM_BINS = 48


class ScoreHistogram(BaseModel):
    """Distribution of the good images' scores. Values above the last edge are counted in the last bin."""

    edges: list[float]  # HISTOGRAM_BINS + 1 bin edges, starting at 0
    counts: list[int]
    clipped: bool  # True if some scores were above the last edge


class TuneReport(BaseModel):
    method: str
    threshold_param: str
    threshold: float
    quantile: float
    score_percentiles: dict[str, float]  # of the interior score pixels over all good images
    min_area: int
    fp_component_count: int  # components left at the tuned threshold before the area filter
    fp_max_area: int
    loo_pass_rate: float  # leave-one-out estimate: would each image pass with min_area derived from the others?
    n_images: int
    warnings: list[str] = []
    score_histogram: ScoreHistogram | None = None  # absent in reports saved before this field existed


def _replace(cfg: PipelineConfig, section: str, **fields: float) -> PipelineConfig:
    return cfg.model_copy(update={section: getattr(cfg, section).model_copy(update=fields)})


def _interior_sample(result: PipelineResult, cfg: PipelineConfig, rng: np.random.Generator) -> np.ndarray:
    m = score_margin(cfg)
    flat = result.score_map[m : result.score_map.shape[0] - m, m : result.score_map.shape[1] - m].ravel()
    return flat if flat.size <= _SAMPLES_PER_IMAGE else rng.choice(flat, _SAMPLES_PER_IMAGE, replace=False)


def _histogram(scores: np.ndarray, threshold: float, p999: float) -> ScoreHistogram:
    """Histogram from 0 to just past the larger of the threshold and the 99.9th percentile.

    Integer-valued scores (the FFT method's 8-bit map) get whole-number bin widths so no bin is systematically empty.
    """
    upper = max(threshold * 1.5, p999 * 1.15, 1e-6)
    if np.array_equal(scores, np.round(scores)):
        width = max(1, math.ceil(upper / HISTOGRAM_BINS))
        bins = math.ceil(upper / width)
        edges = np.arange(bins + 1, dtype=float) * width
    else:
        edges = np.linspace(0.0, upper, HISTOGRAM_BINS + 1)
    counts, edges = np.histogram(np.clip(scores, 0, edges[-1]), bins=edges)
    return ScoreHistogram(edges=[float(e) for e in edges], counts=[int(c) for c in counts], clipped=bool((scores > edges[-1]).any()))


def _percentiles(scores: np.ndarray) -> dict[str, float]:
    return {f"p{q}": float(np.percentile(scores, q)) for q in (50, 99, 99.5, 99.9)} | {"max": float(scores.max())}


def _false_positive_areas(images: list[Image], cfg: PipelineConfig) -> tuple[list[list[int]], int]:
    """Per image, the component areas left on a good image when no area filter is applied (min_area = 1)."""
    probe = _replace(cfg, "morphology", min_area=1)
    results = [run_pipeline(img, probe) for img in images]
    return [[d.area for d in r.defects] for r in results], results[0].stages["gray"].size


def _min_area_from(max_areas: list[int], base_min_area: int, area_margin: float) -> int:
    return max(base_min_area, math.ceil(max(max_areas, default=0) * area_margin))


def _loo_pass_rate(per_image_max: list[int], base_min_area: int, area_margin: float) -> float:
    """Fraction of images that stay below the min_area computed without them (components >= min_area are kept)."""
    passed = 0
    for i, own in enumerate(per_image_max):
        others = per_image_max[:i] + per_image_max[i + 1 :]
        passed += own < _min_area_from(others, base_min_area, area_margin)
    return passed / len(per_image_max)


def auto_tune(
    images: list[Image],
    base: PipelineConfig | None = None,
    quantile: float = 99.5,
    margin: float = 1.1,
    area_margin: float = 2.0,
) -> tuple[PipelineConfig, TuneReport]:
    """Pick the score threshold and min_area so the given good images pass.

    1. Run the method on every image; threshold = quantile-th percentile of all interior scores * margin.
    2. Re-run at that threshold with no area filter; min_area = largest leftover component * area_margin
       (never below the base min_area), so every image used for tuning passes. The margin of 2 is there because
       the largest component of a few images underestimates that of unseen ones (see loo_pass_rate in the report).
    """
    cfg = base or PipelineConfig()
    if cfg.method not in TUNABLE:
        raise ValueError(f"auto-tune supports {sorted(TUNABLE)}; '{cfg.method}' needs a reference image")
    if not MIN_IMAGES <= len(images) <= MAX_IMAGES:
        raise ValueError(f"auto-tune needs {MIN_IMAGES}-{MAX_IMAGES} good images, got {len(images)}")
    section, field, floor = TUNABLE[cfg.method]

    rng = np.random.default_rng(0)
    scores = np.concatenate([_interior_sample(run_pipeline(img, cfg), cfg, rng) for img in images])
    threshold = max(float(np.percentile(scores, quantile)) * margin, floor)
    tuned = _replace(cfg, section, **{field: threshold})

    per_image, image_size = _false_positive_areas(images, tuned)
    per_image_max = [max(a, default=0) for a in per_image]
    min_area = _min_area_from(per_image_max, cfg.morphology.min_area, area_margin)
    tuned = _replace(tuned, "morphology", min_area=min_area)

    warnings = []
    if min_area > 0.001 * image_size:
        warnings.append(f"min_area={min_area}px is large; real defects smaller than that will be ignored")
    if threshold <= floor:
        warnings.append(f"threshold hit its floor ({floor}); the good images are unusually clean")
    report = TuneReport(
        method=cfg.method, threshold_param=f"{section}.{field}", threshold=threshold, quantile=quantile,
        score_percentiles=_percentiles(scores), min_area=min_area,
        fp_component_count=sum(map(len, per_image)), fp_max_area=max(per_image_max),
        loo_pass_rate=_loo_pass_rate(per_image_max, cfg.morphology.min_area, area_margin),
        n_images=len(images), warnings=warnings,
        score_histogram=_histogram(scores, threshold, float(np.percentile(scores, 99.9))),
    )  # fmt: skip
    return tuned, report
