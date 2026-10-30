import numpy as np

from texscan.pipeline.load import to_gray
from texscan.pipeline.types import Image

MIN_CONTENT = 0.25  # never trim away more than 75 % of the frame: a dark scene is not a border


def content_box(image: Image, dark: int = 12, line_fraction: float = 0.02) -> tuple[int, int, int, int]:
    """A column (or row) belongs to the picture when more than line_fraction of its pixels are brighter than `dark`.

    Black letterbox / pillarbox bars (a phone relayed through a virtual webcam, a video with padding) have none, so the
    box runs from the first to the last such column and row. Returns (x0, y0, x1, y1), end exclusive; the whole image
    if there is no border, or if trimming would leave less than 25 % of the area.
    """
    gray = to_gray(image)
    h, w = gray.shape
    lit = gray > dark
    cols = np.flatnonzero(lit.mean(axis=0) > line_fraction)
    rows = np.flatnonzero(lit.mean(axis=1) > line_fraction)
    if cols.size == 0 or rows.size == 0:
        return 0, 0, w, h
    x0, x1, y0, y1 = int(cols[0]), int(cols[-1]) + 1, int(rows[0]), int(rows[-1]) + 1
    if (x1 - x0) * (y1 - y0) < MIN_CONTENT * w * h:
        return 0, 0, w, h
    return x0, y0, x1, y1


def center_crop(image: Image, fraction: float) -> tuple[Image, tuple[int, int, int, int]]:
    """Keep the central `fraction` of each side: out = image[y0:y1, x0:x1] with x0 = (W - fW) / 2, y0 = (H - fH) / 2.

    The edge of the object (cloth against a table) is the most common false alarm; looking only at the middle avoids it.
    Returns (copy, (x0, y0, x1, y1)); fraction >= 1 keeps everything.
    """
    h, w = image.shape[:2]
    cw, ch = max(1, round(w * min(fraction, 1.0))), max(1, round(h * min(fraction, 1.0)))
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    return image[y0 : y0 + ch, x0 : x0 + cw].copy(), (x0, y0, x0 + cw, y0 + ch)


def trim_borders(image: Image, dark: int = 12) -> tuple[Image, tuple[int, int, int, int]]:
    """Crop away black borders: out = image[y0:y1, x0:x1] with (x0, y0, x1, y1) from content_box. Returns (copy, box)."""
    x0, y0, x1, y1 = content_box(image, dark)
    return image[y0:y1, x0:x1].copy(), (x0, y0, x1, y1)
