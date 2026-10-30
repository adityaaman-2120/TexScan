import numpy as np

from texscan.pipeline.types import Image


def bit_planes(gray: Image) -> list[Image]:
    """Plane k of an 8-bit image is bit k of every pixel: P_k = ((I >> k) & 1) * 255, for k = 0 (LSB) .. 7 (MSB).

    The planes add back up: I = sum_k 2^k * (P_k / 255). High planes carry the structure, low planes mostly noise.
    Returns the eight planes in order k = 0 .. 7 as 0/255 uint8 images.
    """
    if gray.ndim != 2 or gray.dtype != np.uint8:
        raise ValueError(f"bit_planes needs a 2-D uint8 image, got {gray.dtype} with shape {gray.shape}")
    return [((gray >> k) & 1).astype(np.uint8) * 255 for k in range(8)]
