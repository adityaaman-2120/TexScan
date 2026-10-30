"""File I/O for images (kept out of pipeline/ so pipeline functions stay pure)."""

from pathlib import Path

import cv2
import numpy as np

from texscan.pipeline.types import Image


def read_image(path: str | Path) -> Image:
    """Decode an image file to a uint8 BGR array (works with non-ASCII Windows paths)."""
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"could not decode image: {path}")
    return image


def write_image(path: str | Path, image: Image) -> None:
    ok, buf = cv2.imencode(Path(path).suffix or ".png", image)
    if not ok:
        raise ValueError(f"could not encode image: {path}")
    buf.tofile(str(path))
