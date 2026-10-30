from typing import Literal

import cv2
import numpy as np
from numpy.typing import NDArray

from texscan.pipeline.types import Image

EnhanceMethod = Literal["clahe", "hist_eq", "none"]
Histogram = NDArray[np.int64]


def histogram(gray: Image) -> Histogram:
    """h[k] = number of pixels with gray level k, k = 0..255."""
    return np.bincount(gray.ravel(), minlength=256).astype(np.int64)


def enhance(
    gray: Image,
    method: EnhanceMethod = "clahe",
    clip_limit: float = 2.0,
    tile_grid: int = 8,
) -> tuple[Image, Histogram, Histogram]:
    """Global equalization maps level k through the CDF: k' = 255 * CDF(k).

    CLAHE does it per tile with the histogram clipped at clip_limit, then interpolates tiles.
    Returns (enhanced, histogram_before, histogram_after).
    """
    if method == "hist_eq":
        out = cv2.equalizeHist(gray)
    elif method == "clahe":
        out = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_grid, tile_grid)).apply(gray)
    else:
        out = gray.copy()
    return out, histogram(gray), histogram(out)
