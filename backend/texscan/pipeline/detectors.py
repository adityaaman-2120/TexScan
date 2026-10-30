"""Detection methods. Each turns the enhanced image into a raw binary defect mask behind one interface."""

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from texscan.pipeline.config import PipelineConfig
from texscan.pipeline.gabor import gabor_energy_maps, gabor_score
from texscan.pipeline.local_stats import local_mean_var, local_stats_score
from texscan.pipeline.notch import notch_filter
from texscan.pipeline.recorder import Recorder
from texscan.pipeline.segment import residual_to_mask
from texscan.pipeline.spectrum import detect_periodic_peaks, fft_spectrum, magnitude_spectrum, mark_peaks
from texscan.pipeline.stats import flag_outliers
from texscan.pipeline.template import abs_difference, align_template
from texscan.pipeline.types import FloatImage, Image, Peaks
from texscan.pipeline.utils import to_uint8


@dataclass
class Detection:
    mask: Image  # raw binary mask, 0 / 255
    peaks: Peaks  # spectral peaks (empty for non-FFT methods)
    score: FloatImage  # continuous per-pixel anomaly score the mask was cut from


Detector = Callable[[Recorder, Image, PipelineConfig, Image | None], Detection]


def detect_fft(rec: Recorder, enhanced: Image, cfg: PipelineConfig, reference: Image | None) -> Detection:
    spectrum, freq = rec.step("fft_spectrum", fft_spectrum, enhanced)
    peaks = rec.step("detect_peaks", detect_periodic_peaks, magnitude_spectrum(freq), **cfg.peaks.model_dump())
    filtered, notch = rec.step("notch_filter", notch_filter, enhanced, peaks, **cfg.notch.model_dump())
    rec.stages.update(
        spectrum=spectrum,
        spectrum_peaks=mark_peaks(spectrum, peaks),
        notch_mask=to_uint8(notch),
        residual=to_uint8(filtered),
    )
    magnitude, raw = rec.step("residual_to_mask", residual_to_mask, filtered, **cfg.threshold.model_dump())
    rec.stages.update(residual_abs=to_uint8(magnitude), mask_raw=raw)
    return Detection(raw, peaks, magnitude.astype(np.float32))


def gabor_margin(cfg: PipelineConfig) -> int:
    """Border ignored by Gabor: kernel half-size (3 sigma = 1.68 lambda) + 2 smoothing sigmas, where padding corrupts energy."""
    g = cfg.gabor
    return max(cfg.threshold.border, int(1.68 * max(g.wavelengths) + 2 * g.smooth_sigma))


def score_margin(cfg: PipelineConfig) -> int:
    """Border width (px) where the method's score map is not trustworthy and is ignored."""
    return gabor_margin(cfg) if cfg.method == "gabor" else cfg.threshold.border


def detect_gabor(rec: Recorder, enhanced: Image, cfg: PipelineConfig, reference: Image | None) -> Detection:
    g = cfg.gabor
    energy = rec.step("gabor_energy", gabor_energy_maps, enhanced, g.orientations, tuple(g.wavelengths), g.smooth_sigma)
    score = rec.step("gabor_score", gabor_score, energy, g.rel_floor)
    raw = rec.step("flag_outliers", flag_outliers, score, g.k, gabor_margin(cfg))
    rec.stages.update(gabor_energy=to_uint8(energy.mean(axis=0)), anomaly_score=to_uint8(score), mask_raw=raw)
    return Detection(raw, np.empty((0, 2), np.int64), score)


def detect_template(rec: Recorder, enhanced: Image, cfg: PipelineConfig, reference: Image | None) -> Detection:
    if reference is None:
        raise ValueError("method 'golden_template' needs a reference (good) image")
    aligned, _, _ = rec.step("align_template", align_template, enhanced, reference, **cfg.template.model_dump())
    diff = rec.step("abs_difference", abs_difference, enhanced, aligned)
    magnitude, raw = rec.step("residual_to_mask", residual_to_mask, diff, **cfg.threshold.model_dump())
    rec.stages.update(
        aligned_reference=aligned, difference=to_uint8(diff), residual_abs=to_uint8(magnitude), mask_raw=raw
    )
    return Detection(raw, np.empty((0, 2), np.int64), magnitude.astype(np.float32))


def detect_local_stats(rec: Recorder, enhanced: Image, cfg: PipelineConfig, reference: Image | None) -> Detection:
    s = cfg.local_stats
    mean, var = rec.step("local_mean_var", local_mean_var, enhanced, s.window)
    score = rec.step("local_stats_score", local_stats_score, mean, var, s.rel_floor)
    raw = rec.step("flag_outliers", flag_outliers, score, s.k, cfg.threshold.border)
    rec.stages.update(
        local_mean=to_uint8(mean), local_variance=to_uint8(np.log1p(var)), anomaly_score=to_uint8(score), mask_raw=raw
    )
    return Detection(raw, np.empty((0, 2), np.int64), score)


DETECTORS: dict[str, Detector] = {
    "fft": detect_fft,
    "gabor": detect_gabor,
    "golden_template": detect_template,
    "local_statistics": detect_local_stats,
}
