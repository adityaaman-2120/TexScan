"""Real-world size: mm per pixel from a calibration marker or a ruler, and defect sizes in mm and inches.

Everything here is a pure function (arrays and numbers in, arrays and numbers out).

Geometry. A calibration stores mm_per_pixel measured on an image whose longest side was `image_long_side` pixels, so the
frame's long side spans F = mm_per_pixel * image_long_side millimetres. A later image of the same camera setup, at any
resolution, therefore has F / L0 mm per original pixel (L0 = its longest side), and because the pipeline crops and
then resizes, F / L0 / s mm per working pixel, where s = working long side / cropped long side.
"""

import math

import cv2
import numpy as np
from numpy.typing import NDArray

from texscan.pipeline.types import Calibration, Defect, Image

MM_PER_INCH = 25.4
DEFAULT_DICTIONARY = "DICT_4X4_50"
MARKER_ID = 0  # the marker the app prints


def min_area_rect_size(points_xy: NDArray[np.float32]) -> tuple[float, float]:
    """(length, width) of the minimum-area rotated rectangle around pixel centres, in pixels, length >= width.

    cv2.minAreaRect spans pixel centres, so one pixel is added to each side: a single pixel is 1 x 1, a straight
    run of n pixels is n x 1.
    """
    if len(points_xy) == 0:
        return 0.0, 0.0
    _, (w, h), _ = cv2.minAreaRect(np.asarray(points_xy, dtype=np.float32).reshape(-1, 1, 2))
    return float(max(w, h)) + 1.0, float(min(w, h)) + 1.0


def marker_side_px(corners: NDArray[np.float64]) -> float:
    """Mean length of the four edges of a detected marker, from its (4, 2) corner array, in pixels."""
    corners = np.asarray(corners, dtype=np.float64).reshape(4, 2)
    return float(np.mean([np.linalg.norm(corners[i] - corners[(i + 1) % 4]) for i in range(4)]))


def detect_markers(gray: Image, dictionary: str = DEFAULT_DICTIONARY) -> list[tuple[int, NDArray[np.float64]]]:
    """ArUco markers found in a grayscale image, as (id, (4, 2) corners of the outer black square), largest first."""
    aruco = cv2.aruco
    params = aruco.DetectorParameters()
    params.cornerRefinementMethod = aruco.CORNER_REFINE_SUBPIX  # without it the corners sit on boundary pixel centres, about 1 px short per side
    detector = aruco.ArucoDetector(aruco.getPredefinedDictionary(getattr(aruco, dictionary)), params)
    corners, ids, _ = detector.detectMarkers(gray)
    found = [(int(i), c.reshape(4, 2).astype(np.float64)) for c, i in zip(corners, [] if ids is None else ids.ravel())]
    return sorted(found, key=lambda m: marker_side_px(m[1]), reverse=True)


def scale_from_marker(corners: NDArray[np.float64], side_mm: float) -> float:
    """mm per pixel = printed side length / measured side length in pixels."""
    if side_mm <= 0:
        raise ValueError("the marker side must be positive")
    return side_mm / marker_side_px(corners)


def scale_from_points(p1: tuple[float, float], p2: tuple[float, float], distance_mm: float) -> float:
    """mm per pixel = known distance / pixel distance between two clicked points."""
    pixels = math.dist(p1, p2)
    if distance_mm <= 0 or pixels <= 0:
        raise ValueError("the two points must be apart and the distance must be positive")
    return distance_mm / pixels


def mm_per_working_pixel(
    calibration: Calibration, full_shape: tuple[int, ...], crop_shape: tuple[int, ...], working_shape: tuple[int, ...]
) -> float:
    """mm per pixel of the image the detectors see, given the original frame, the part kept after cropping, and the resized result."""
    frame_long = max(full_shape[:2])
    crop_long = max(crop_shape[:2])
    working_long = max(working_shape[:2])
    mm_per_original_pixel = calibration.mm_per_pixel * calibration.image_long_side / frame_long
    return mm_per_original_pixel * crop_long / working_long


def with_physical_size(defects: list[Defect], mm_per_pixel: float) -> list[Defect]:
    """Copies of the defects with length, width (min-area rectangle) and area in mm and inches: mm = px * s, mm^2 = px^2 * s^2."""
    out = []
    for d in defects:
        length_mm = None if d.length_px is None else d.length_px * mm_per_pixel
        width_mm = None if d.width_px is None else d.width_px * mm_per_pixel
        area_mm2 = d.area * mm_per_pixel**2
        out.append(
            d.model_copy(
                update={
                    "length_mm": length_mm,
                    "width_mm": width_mm,
                    "area_mm2": area_mm2,
                    "length_in": None if length_mm is None else length_mm / MM_PER_INCH,
                    "width_in": None if width_mm is None else width_mm / MM_PER_INCH,
                    "area_in2": area_mm2 / MM_PER_INCH**2,
                }
            )
        )
    return out
