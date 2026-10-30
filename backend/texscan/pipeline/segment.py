from typing import Literal

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter

from texscan.pipeline.types import FloatImage, Image

ThresholdMethod = Literal["otsu", "adaptive"]


def _zero_border(image: np.ndarray, border: int) -> None:
    if border > 0:
        image[:border], image[-border:] = 0, 0
        image[:, :border], image[:, -border:] = 0, 0


def residual_to_mask(
    residual: FloatImage,
    method: ThresholdMethod = "otsu",
    sigma: float = 2.0,
    min_threshold: float = 12.0,
    block_size: int = 51,
    offset: float = 8.0,
    border: int = 8,
) -> tuple[Image, Image]:
    """m = G_sigma * |r - median(r)|, then mask = m > T.

    Otsu picks T maximizing between-class variance; adaptive uses T = local mean + offset.
    T is never below min_threshold (gray levels), so a clean texture yields an empty mask.
    Returns (smoothed absolute residual as uint8, binary mask 0/255).
    """
    deviation = gaussian_filter(np.abs(residual - np.median(residual)), sigma)
    _zero_border(deviation, border)
    magnitude = np.clip(np.rint(deviation), 0, 255).astype(np.uint8)
    if method == "otsu":
        otsu, _ = cv2.threshold(magnitude, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        mask = np.where(magnitude > max(otsu, min_threshold), 255, 0).astype(np.uint8)
    else:
        local = cv2.adaptiveThreshold(
            magnitude, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, -offset
        )
        mask = np.where((local > 0) & (magnitude > min_threshold), 255, 0).astype(np.uint8)
    return magnitude, mask


def remove_small_components(mask: Image, min_area: int) -> Image:
    """Label 8-connected components and keep only those with area >= min_area pixels."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    keep = np.zeros(count, dtype=bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    return np.where(keep[labels], 255, 0).astype(np.uint8)


def morphology_cleanup(mask: Image, kernel_size: int = 3, min_area: int = 50) -> Image:
    """Opening (erode then dilate) removes specks; closing (dilate then erode) fills gaps.

    Uses an elliptical structuring element, then drops components smaller than min_area.
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel)
    return remove_small_components(closed, min_area)
