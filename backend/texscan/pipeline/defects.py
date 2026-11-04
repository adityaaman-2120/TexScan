import math

import cv2
import numpy as np
from skimage.measure import label, regionprops
from skimage.measure._regionprops import RegionProperties

from texscan.pipeline.measure import min_area_rect_size
from texscan.pipeline.segment import group_labels
from texscan.pipeline.types import Defect, Image


def _orientation_deg(region: RegionProperties) -> float:
    ys, xs = region.coords[:, 0].astype(float), region.coords[:, 1].astype(float)
    cov = np.cov(np.vstack([xs, ys])) if len(xs) > 1 else np.zeros((2, 2))
    theta = 0.5 * math.atan2(2 * cov[0, 1], cov[0, 0] - cov[1, 1])
    return math.degrees(theta) % 180


def _contrast(gray: Image, labels: np.ndarray, region: RegionProperties, ring: int) -> float | None:
    """mean(inside) - mean(ring of `ring` px around it, excluding other defects); negative = darker."""
    h, w = labels.shape
    y0, x0, y1, x1 = region.bbox
    rows, cols = slice(max(y0 - ring - 1, 0), min(y1 + ring + 1, h)), slice(max(x0 - ring - 1, 0), min(x1 + ring + 1, w))
    own = labels[rows, cols] == region.label
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * ring + 1, 2 * ring + 1))
    surround = cv2.dilate(own.astype(np.uint8), kernel).astype(bool) & (labels[rows, cols] == 0)
    if not surround.any():
        return None
    crop = gray[rows, cols].astype(np.float32)
    return float(crop[own].mean() - crop[surround].mean())


def _describe(index: int, region: RegionProperties, contrast: float | None) -> Defect:
    y0, x0, y1, x1 = region.bbox
    cy, cx = region.centroid
    length, width = min_area_rect_size(region.coords[:, ::-1].astype(np.float32))  # (row, col) -> (x, y)
    return Defect(
        id=index,
        bbox=(x0, y0, x1 - x0, y1 - y0),
        area=int(region.area),
        centroid=(float(cx), float(cy)),
        perimeter=float(region.perimeter),
        aspect_ratio=float(region.axis_major_length / max(region.axis_minor_length, 1.0)),
        solidity=float(region.solidity),
        orientation_deg=_orientation_deg(region),
        contrast=contrast,
        length_px=length,
        width_px=width,
    )


def extract_defects(mask: Image, gray: Image | None = None, ring: int = 7, merge_distance: int = 0) -> list[Defect]:
    """Label 8-connected components (pieces closer than merge_distance px share a label), then describe each from its pixel set.

    Orientation is the principal axis of the covariance matrix: theta = 0.5 * atan2(2 Cxy, Cxx - Cyy).
    With a gray image, also measures contrast against a `ring`-pixel surround.
    """
    labels = group_labels(mask, merge_distance) if merge_distance >= 2 else label(mask > 0, connectivity=2)
    return [
        _describe(i, r, None if gray is None else _contrast(gray, labels, r, ring))
        for i, r in enumerate(regionprops(labels), start=1)
    ]
