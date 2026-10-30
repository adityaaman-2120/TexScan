from typing import Literal

import cv2

from texscan.pipeline.types import Image

DenoiseMethod = Literal["median", "gaussian", "none"]


def denoise(gray: Image, method: DenoiseMethod = "median", ksize: int = 5) -> Image:
    """Median: out(x) = median of the k x k window (removes impulse noise, keeps edges).

    Gaussian: out = in * G_sigma with sigma derived from ksize (low-pass, blurs edges).
    """
    if method == "none":
        return gray.copy()
    if ksize < 1 or ksize % 2 == 0:
        raise ValueError("ksize must be a positive odd number")
    if method == "median":
        return cv2.medianBlur(gray, ksize)
    return cv2.GaussianBlur(gray, (ksize, ksize), 0)
