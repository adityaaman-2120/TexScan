from typing import Literal, TypeAlias

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, Field

Image: TypeAlias = NDArray[np.uint8]  # gray (H, W) or BGR (H, W, 3)
FloatImage: TypeAlias = NDArray[np.float32]
ComplexImage: TypeAlias = NDArray[np.complex64]
Peaks: TypeAlias = NDArray[np.int64]  # (N, 2) of (row, col) in the shifted spectrum

DefectType = Literal["hole", "tear_line", "stain", "thread_fiber", "unknown"]


class Calibration(BaseModel):
    """Real-world scale of a camera setup, stored in a profile's config.

    mm_per_pixel was measured on an image whose longest side was image_long_side pixels (see pipeline/measure.py for how
    it carries over to images of other sizes).
    """

    mm_per_pixel: float = Field(gt=0)
    image_long_side: int = Field(ge=1)
    source: Literal["marker", "ruler"]
    reference_mm: float = Field(gt=0)  # the printed marker side, or the ruler distance, that was measured


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
    length_px: float | None = None  # longest side of the minimum-area rotated rectangle
    width_px: float | None = None  # its shorter side
    # real-world size; set only when the profile is calibrated
    length_mm: float | None = None
    width_mm: float | None = None
    area_mm2: float | None = None
    length_in: float | None = None
    width_in: float | None = None
    area_in2: float | None = None
