import cv2
import numpy as np

from texscan.pipeline.types import Image


def to_gray(image: Image) -> Image:
    """Luma conversion Y = 0.299 R + 0.587 G + 0.114 B (gray input is returned as a copy)."""
    if image.ndim == 2:
        return image.copy()
    code = cv2.COLOR_BGRA2GRAY if image.shape[2] == 4 else cv2.COLOR_BGR2GRAY
    return cv2.cvtColor(image, code)


def resize_longest(image: Image, max_side: int = 1024) -> Image:
    """Scale by s = max_side / max(H, W), keeping aspect ratio (area interp. down, bilinear up)."""
    h, w = image.shape[:2]
    scale = max_side / max(h, w)
    if scale == 1:
        return image.copy()
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    return cv2.resize(image, size, interpolation=interp)


def load_and_normalize(image: Image, max_side: int = 1024) -> Image:
    """Grayscale then resize so the longest side equals max_side.

    Takes an already-decoded uint8 array (file reading lives in texscan.imageio).
    """
    if image.dtype != np.uint8:
        raise ValueError(f"expected uint8 image, got {image.dtype}")
    return resize_longest(to_gray(image), max_side)
