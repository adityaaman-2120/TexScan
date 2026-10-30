"""Loader for the MVTec AD texture categories (https://www.mvtec.com/company/research/datasets/mvtec-ad).

Expected layout:  <root>/<category>/test/<defect_type>/<name>.png
                  <root>/<category>/ground_truth/<defect_type>/<name>_mask.png   (not for "good")
                  <root>/<category>/train/good/*.png
"""

import os
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from texscan.imageio import read_image
from texscan.pipeline.load import to_gray

ENV_VAR = "MVTEC_PATH"
TEXTURE_CATEGORIES = ("carpet", "grid", "leather", "tile", "wood")
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp"}


class DatasetNotFoundError(RuntimeError):
    pass


@dataclass(frozen=True)
class Sample:
    image_path: Path
    mask_path: Path | None  # None for defect-free images
    defect_type: str  # "good" or the defect name

    @property
    def label(self) -> int:
        """1 = defective, 0 = good."""
        return int(self.defect_type != "good")


def mvtec_root(env: dict[str, str] | None = None) -> Path:
    value = (env if env is not None else os.environ).get(ENV_VAR)
    if not value:
        raise DatasetNotFoundError(
            f"{ENV_VAR} is not set. Download MVTec AD and point {ENV_VAR} at the folder that contains "
            "carpet/, grid/, leather/, tile/, wood/ (see README, 'Evaluation')."
        )
    root = Path(value)
    if not root.is_dir():
        raise DatasetNotFoundError(f"{ENV_VAR}={value} is not a directory")
    return root


def _images(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in _IMAGE_SUFFIXES)


def _mask_for(category_dir: Path, defect_type: str, image: Path) -> Path:
    mask = category_dir / "ground_truth" / defect_type / f"{image.stem}_mask.png"
    if not mask.is_file():
        raise DatasetNotFoundError(f"missing ground-truth mask: {mask}")
    return mask


def load_category(root: Path, category: str) -> list[Sample]:
    """All test samples of one category (good + every defect type), sorted by defect type then name."""
    category_dir = root / category
    test_dir = category_dir / "test"
    if not test_dir.is_dir():
        raise DatasetNotFoundError(f"category '{category}' not found under {root} (expected {test_dir})")
    samples: list[Sample] = []
    for defect_dir in sorted(p for p in test_dir.iterdir() if p.is_dir()):
        defect = defect_dir.name
        for image in _images(defect_dir):
            mask = None if defect == "good" else _mask_for(category_dir, defect, image)
            samples.append(Sample(image, mask, defect))
    return samples


def reference_path(root: Path, category: str) -> Path:
    """The golden-template reference: the first defect-free training image of the category."""
    good = root / category / "train" / "good"
    if not good.is_dir():
        raise DatasetNotFoundError(f"missing training folder: {good}")
    images = _images(good)
    if not images:
        raise DatasetNotFoundError(f"no images in {good}")
    return images[0]


def subsample(samples: list[Sample], limit: int | None) -> list[Sample]:
    """First `limit` samples taken round-robin across defect types so 'good' is always represented."""
    if limit is None or limit >= len(samples):
        return samples
    groups: dict[str, list[Sample]] = {}
    for s in samples:
        groups.setdefault(s.defect_type, []).append(s)
    picked: list[Sample] = []
    while len(picked) < limit:
        for group in groups.values():
            if group and len(picked) < limit:
                picked.append(group.pop(0))
    return picked


def load_gt_mask(sample: Sample, shape: tuple[int, int]) -> NDArray[np.bool_]:
    """Ground-truth mask resized (nearest) to the pipeline's working resolution; all False for good images."""
    if sample.mask_path is None:
        return np.zeros(shape, dtype=bool)
    gray = to_gray(read_image(sample.mask_path))
    resized = cv2.resize(gray, (shape[1], shape[0]), interpolation=cv2.INTER_NEAREST)
    return resized > 0
