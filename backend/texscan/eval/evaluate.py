import time
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any

import numpy as np

from texscan.eval.metrics import classification_metrics, dice, iou
from texscan.eval.mvtec import Sample, load_category, load_gt_mask, reference_path, subsample
from texscan.imageio import read_image
from texscan.pipeline import PipelineConfig, run_pipeline

ProgressFn = Callable[[str], None]


@dataclass(frozen=True)
class ImageOutcome:
    label: int
    predicted: int
    iou: float | None  # only for defective images
    dice: float | None
    seconds: float
    error: str | None = None


def evaluate_sample(sample: Sample, config: PipelineConfig, reference: Path | None) -> ImageOutcome:
    """Run one image. A crash is recorded as an error (predicted good) instead of aborting the whole run."""
    start = time.perf_counter()
    try:
        ref = read_image(reference) if reference and config.method == "golden_template" else None
        result = run_pipeline(read_image(sample.image_path), config, ref)
        pred = result.stages["mask_clean"] > 0
        gt = load_gt_mask(sample, pred.shape)
        defective = sample.label == 1
        return ImageOutcome(
            sample.label,
            int(result.decision == "FAIL"),
            iou(pred, gt) if defective else None,
            dice(pred, gt) if defective else None,
            time.perf_counter() - start,
        )
    except Exception as exc:  # noqa: BLE001 - reported in the results, never hidden
        return ImageOutcome(sample.label, 0, None, None, time.perf_counter() - start, f"{type(exc).__name__}: {exc}")


def _mean(values: list[float]) -> float | None:
    return float(np.mean(values)) if values else None


def summarize(outcomes: list[ImageOutcome]) -> dict[str, Any]:
    """Image-level metrics over all images; pixel IoU/Dice are averaged over the defective images only."""
    summary: dict[str, Any] = classification_metrics([o.label for o in outcomes], [o.predicted for o in outcomes])
    summary.update(
        pixel_iou=_mean([o.iou for o in outcomes if o.iou is not None]),
        pixel_dice=_mean([o.dice for o in outcomes if o.dice is not None]),
        n_images=len(outcomes),
        n_defective=sum(o.label for o in outcomes),
        errors=[o.error for o in outcomes if o.error],
        seconds_per_image=float(np.mean([o.seconds for o in outcomes])) if outcomes else 0.0,
    )
    return summary


def evaluate_category(
    root: Path,
    category: str,
    config: PipelineConfig,
    limit: int | None = None,
    workers: int = 1,
) -> dict[str, Any]:
    samples = subsample(load_category(root, category), limit)
    reference = reference_path(root, category) if config.method == "golden_template" else None
    work = partial(evaluate_sample, config=config, reference=reference)
    if workers > 1:
        with ProcessPoolExecutor(workers) as pool:
            outcomes = list(pool.map(work, samples, chunksize=2))
    else:
        outcomes = [work(s) for s in samples]
    return summarize(outcomes)


def evaluate_all(
    root: Path,
    methods: list[str],
    categories: list[str],
    max_side: int = 1024,
    limit: int | None = None,
    workers: int = 1,
    progress: ProgressFn = lambda _: None,
) -> dict[str, dict[str, dict[str, Any]]]:
    """results[method][category] = metrics. Every method runs with its default (untuned) config."""
    results: dict[str, dict[str, dict[str, Any]]] = {}
    for method in methods:
        config = PipelineConfig.model_validate({"method": method, "max_side": max_side})
        for category in categories:
            progress(f"{method} / {category} ...")
            results.setdefault(method, {})[category] = evaluate_category(root, category, config, limit, workers)
    return results
