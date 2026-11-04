"""Colour cue: finds defects that change the cloth's colour but not its texture (stains, burns, a hole showing what is underneath).

The texture detectors only see gray structure, so a flat patch of a different colour slips through them.
"""

import cv2
import numpy as np

from texscan.pipeline.types import FloatImage, Image

BACKGROUND_SCALE = 8  # the local cloth colour is estimated on a copy this many times smaller
LIGHTNESS_WEIGHT = 0.25  # brightness counts a quarter as much as hue: stripes and prints must not look like defects


def colour_deviation(image: Image, sigma: float = 2.5) -> FloatImage:
    """d(x) = sqrt((w * dL)^2 + da^2 + db^2) with (dL, da, db) = Lab(x) - B(x), smoothed by a Gaussian of width sigma.

    B is the local cloth colour: a large median filter of the Lab image (taken on a shrunken copy), which ignores
    anything smaller than about half the filter. Lightness is down-weighted (w = 0.25) so light and dark stripes
    do not count, only a change of hue or saturation does. Gray input has no colour, so its deviation is zero.
    """
    if image.ndim == 2:
        return np.zeros(image.shape, np.float32)
    lab = cv2.cvtColor(image[..., :3], cv2.COLOR_BGR2Lab)
    h, w = lab.shape[:2]
    small = cv2.resize(lab, (max(8, w // BACKGROUND_SCALE), max(8, h // BACKGROUND_SCALE)), interpolation=cv2.INTER_AREA)
    ksize = max(3, (min(small.shape[:2]) // 3) | 1)
    background = np.stack([cv2.medianBlur(np.ascontiguousarray(small[..., c]), ksize) for c in range(3)], axis=-1)
    background = cv2.resize(background.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
    diff = lab.astype(np.float32) - background
    diff[..., 0] *= LIGHTNESS_WEIGHT
    distance = np.sqrt((diff**2).sum(axis=-1))
    return cv2.GaussianBlur(distance, (0, 0), sigma).astype(np.float32)


def colour_cutoff(deviation: FloatImage, k: float = 6.0, floor: float = 12.0) -> float:
    """cutoff = median + max(k * 1.4826 * MAD, floor): k robust deviations above the typical value, and never below an
    absolute floor (Lab units, about a just-noticeable colour difference) so a perfectly flat picture does not flag noise."""
    median = float(np.median(deviation))
    mad = float(np.median(np.abs(deviation - median)))
    return median + max(k * 1.4826 * mad, floor)


def colour_mask(deviation: FloatImage, k: float = 6.0, floor: float = 12.0, border: int = 0, close_size: int = 7) -> Image:
    """mask = d > colour_cutoff, then a closing of close_size joins the pieces of one defect (a hole and its frayed rim).

    border pixels are cleared. Output is 0 / 255.
    """
    mask = np.where(deviation > colour_cutoff(deviation, k, floor), 255, 0).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_size, close_size))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    if border > 0:
        mask[:border], mask[-border:] = 0, 0
        mask[:, :border], mask[:, -border:] = 0, 0
    return mask


def colour_k_needed(deviation: FloatImage, quantile: float = 99.95) -> float:
    """The k at which the colour cue would just stay silent on this (good) picture: (high percentile - median) / (1.4826 * MAD)."""
    median = float(np.median(deviation))
    mad = float(np.median(np.abs(deviation - median)))
    return (float(np.percentile(deviation, quantile)) - median) / max(1.4826 * mad, 1e-6)
