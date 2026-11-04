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


def group_labels(mask: Image, distance: int) -> np.ndarray:
    """Label the mask so that pieces closer than `distance` px share a label (0 = background).

    The mask is dilated by distance / 2, the 8-connected components of that are numbered, and each mask pixel takes
    the number of the component it lies in. With distance < 2 this is plain 8-connected labelling.
    """
    on = mask > 0
    if distance < 2:
        return cv2.connectedComponents(on.astype(np.uint8), connectivity=8)[1]
    size = distance + 1 - distance % 2  # odd, so the dilation grows by distance / 2 on each side
    grouped = cv2.dilate(on.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size)))
    return np.where(on, cv2.connectedComponents(grouped, connectivity=8)[1], 0)


def remove_small_components(mask: Image, min_area: int, merge_distance: int = 0) -> Image:
    """Keep only the groups of components whose total area is >= min_area pixels (8-connected; see group_labels for merge_distance)."""
    labels = group_labels(mask, merge_distance)
    areas = np.bincount(labels.ravel())
    keep = areas >= min_area
    keep[0] = False
    return np.where(keep[labels], 255, 0).astype(np.uint8)


def morphology_cleanup(mask: Image, kernel_size: int = 3, min_area: int = 50, merge_fraction: float = 0.0) -> Image:
    """Opening (erode then dilate) removes specks; closing (dilate then erode) fills gaps.

    Uses an elliptical structuring element, then drops groups smaller than min_area. Pieces closer than merge_fraction
    of the longest side form one group, so the fragments of one defect count together instead of each being too small.
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    opened = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel)
    return remove_small_components(closed, min_area, round(merge_fraction * max(mask.shape[:2])))
