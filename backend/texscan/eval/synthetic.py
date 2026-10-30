"""Tiny synthetic dataset in MVTec AD layout, for smoke-testing the evaluation harness.

NOT a benchmark: results on it say nothing about performance on real fabric/surface images.
"""

from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter

from texscan.imageio import write_image
from texscan.pipeline.types import Image

CATEGORIES = ("synthetic_sinusoid", "synthetic_plaid", "synthetic_noise")


def _texture(category: str, size: int, rng: np.random.Generator) -> np.ndarray:
    y, x = np.mgrid[0:size, 0:size] / size
    cycles = size // 16
    if category == "synthetic_sinusoid":
        base = 128 + 50 * np.sin(2 * np.pi * cycles * x)
    elif category == "synthetic_plaid":
        base = 128 + 25 * (np.sin(2 * np.pi * cycles * x) + np.sin(2 * np.pi * cycles * y))
    else:  # stochastic, non-periodic
        base = 128 + 25 * gaussian_filter(rng.normal(0, 1, (size, size)), 3) / 0.15
    return base + rng.normal(0, 2, (size, size))


def _to_u8(image: np.ndarray) -> Image:
    return np.clip(image, 0, 255).astype(np.uint8)


def _scratch(shape: tuple[int, int], rng: np.random.Generator) -> np.ndarray:
    mask = np.zeros(shape, bool)
    size = shape[0]
    row, x0 = int(rng.integers(size // 5, 4 * size // 5)), int(rng.integers(size // 8, size // 3))
    mask[row : row + max(3, size // 80), x0 : x0 + size // 2] = True
    return mask


def _blob(shape: tuple[int, int], rng: np.random.Generator) -> np.ndarray:
    size = shape[0]
    cy, cx = (int(v) for v in rng.integers(size // 5, 4 * size // 5, 2))
    yy, xx = np.ogrid[: shape[0], : shape[1]]
    return (yy - cy) ** 2 + (xx - cx) ** 2 <= (size // 22) ** 2


def make_synthetic_mvtec(
    root: Path,
    categories: tuple[str, ...] = CATEGORIES,
    size: int = 512,
    n_train: int = 2,
    n_good: int = 6,
    n_per_defect: int = 5,
    seed: int = 0,
) -> Path:
    """Write train/good, test/good and test/{scratch,blob} with masks for each category; returns root."""
    rng = np.random.default_rng(seed)
    for category in categories:
        base = root / category
        for i in range(n_train):
            _save(base / "train" / "good" / f"{i:03d}.png", _to_u8(_texture(category, size, rng)))
        for i in range(n_good):
            _save(base / "test" / "good" / f"{i:03d}.png", _to_u8(_texture(category, size, rng)))
        for name, make_mask, value in (("scratch", _scratch, 235), ("blob", _blob, 40)):
            for i in range(n_per_defect):
                mask = make_mask((size, size), rng)
                image = _texture(category, size, rng)
                image[mask] = value
                _save(base / "test" / name / f"{i:03d}.png", _to_u8(image))
                _save(base / "ground_truth" / name / f"{i:03d}_mask.png", (mask * 255).astype(np.uint8))
    return root


def _save(path: Path, image: Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_image(path, cv2.cvtColor(image, cv2.COLOR_GRAY2BGR))
