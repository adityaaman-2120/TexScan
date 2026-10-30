from typing import Literal, TypeAlias

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel

Image: TypeAlias = NDArray[np.uint8]  # gray (H, W) or BGR (H, W, 3)
FloatImage: TypeAlias = NDArray[np.float32]
ComplexImage: TypeAlias = NDArray[np.complex64]
Peaks: TypeAlias = NDArray[np.int64]  # (N, 2) of (row, col) in the shifted spectrum

DefectType = Literal["hole", "tear_line", "stain", "thread_fiber", "unknown"]


class Defect(BaseModel):
    """One connected defect region. Coordinates are in pixels of the normalized image."""

    id: int
    bbox: tuple[int, int, int, int]  # x, y, width, height
    area: int
    centroid: tuple[float, float]  # x, y
    perimeter: float
    aspect_ratio: float  # major / minor axis length of the equivalent ellipse, >= 1
    solidity: float  # area / convex hull area, in (0, 1]
    orientation_deg: float  # major axis angle from +x, clockwise on screen, in [0, 180)
    contrast: float | None = None  # mean gray inside minus mean gray of the surrounding ring (needs gray image)
    defect_type: DefectType | None = None  # set by classify_defects
    type_confidence: float | None = None  # 0..1, how strongly the rules matched
