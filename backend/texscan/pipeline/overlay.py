import cv2
import numpy as np

from texscan.pipeline.types import Image


def edges_overlay(
    original: Image,
    mask: Image,
    color: tuple[int, int, int] = (0, 0, 255),
    thickness: int = 1,
) -> Image:
    """Canny edges of the binary defect mask (gradient + hysteresis) painted over the original.

    color is BGR (default red); thickness > 1 dilates the edge lines.
    """
    base = cv2.cvtColor(original, cv2.COLOR_GRAY2BGR) if original.ndim == 2 else original.copy()
    edges = cv2.Canny(mask, 50, 150)
    if thickness > 1:
        edges = cv2.dilate(edges, np.ones((thickness, thickness), np.uint8))
    base[edges > 0] = color
    return base
