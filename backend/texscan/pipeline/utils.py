import numpy as np

from texscan.pipeline.types import Image


def to_uint8(image: np.ndarray) -> Image:
    """Min-max stretch any array to uint8.

    out = round(255 * (x - min) / (max - min)); a constant image maps to zeros.
    """
    lo, hi = float(image.min()), float(image.max())
    if hi - lo < 1e-9:
        return np.zeros(image.shape, dtype=np.uint8)
    return np.rint((image.astype(np.float32) - lo) / (hi - lo) * 255).astype(np.uint8)
