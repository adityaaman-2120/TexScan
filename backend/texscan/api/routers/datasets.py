"""Browse the MVTec AD textures configured through MVTEC_PATH (see the README, 'Evaluation')."""

import re
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from texscan.api.common import ApiError
from texscan.api.schemas import MvtecCategory, MvtecSample, MvtecStatus
from texscan.eval.mvtec import TEXTURE_CATEGORIES, DatasetNotFoundError, mvtec_root

router = APIRouter(prefix="/datasets/mvtec", tags=["datasets"])

_SAFE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_. \-]*$")
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp"}


def _root() -> Path:
    try:
        return mvtec_root()
    except DatasetNotFoundError as exc:
        raise ApiError(404, str(exc)) from exc


def _part(value: str, what: str) -> str:
    """A single path component: no separators, no leading dot, so nothing can climb out of the dataset folder."""
    if not _SAFE.match(value) or ".." in value:
        raise ApiError(422, f"invalid {what}: {value!r}")
    return value


def _inside(root: Path, path: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ApiError(422, "path escapes the dataset folder")
    if not resolved.is_file():
        raise ApiError(404, "no such file in the dataset")
    return resolved


def _images(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in _IMAGE_SUFFIXES) if folder.is_dir() else []


def _category_dir(root: Path, category: str) -> Path:
    folder = root / _part(category, "category")
    if not (folder / "test").is_dir():
        raise ApiError(404, f"category '{category}' not found in the dataset")
    return folder


@router.get("", response_model=MvtecStatus)
def status() -> MvtecStatus:
    """Whether MVTEC_PATH points at a dataset, and which categories it has (texture categories listed first)."""
    try:
        root = mvtec_root()
    except DatasetNotFoundError as exc:
        return MvtecStatus(available=False, message=str(exc))
    names = sorted((p.name for p in root.iterdir() if (p / "test").is_dir()), key=lambda n: (n not in TEXTURE_CATEGORIES, n))
    categories = []
    for name in names:
        types = {d.name: len(_images(d)) for d in sorted((root / name / "test").iterdir()) if d.is_dir()}
        categories.append(MvtecCategory(name=name, test_images=sum(types.values()), defect_types=types, has_masks=(root / name / "ground_truth").is_dir()))
    if not categories:
        return MvtecStatus(available=False, message=f"no MVTec categories (folders with a test/ subfolder) found in {root.name}")
    return MvtecStatus(available=True, categories=categories)


@router.get("/samples", response_model=list[MvtecSample])
def samples(
    category: Annotated[str, Query()],
    defect_type: Annotated[str | None, Query(description="e.g. 'good', 'color', 'hole'")] = None,
    defective_only: Annotated[bool, Query()] = True,
    limit: Annotated[int, Query(ge=1, le=200)] = 24,
) -> list[MvtecSample]:
    """Test images of one category, round-robin across defect types so every type shows up."""
    root = _root()
    folder = _category_dir(root, category) / "test"
    types = [defect_type] if defect_type else sorted(d.name for d in folder.iterdir() if d.is_dir() and (not defective_only or d.name != "good"))
    queues = [[(t, p) for p in _images(folder / _part(t, "defect type"))] for t in types]
    picked: list[tuple[str, Path]] = []
    while len(picked) < limit and any(queues):
        for queue in queues:
            if queue and len(picked) < limit:
                picked.append(queue.pop(0))
    masks = root / category / "ground_truth"
    return [
        MvtecSample(category=category, defect_type=t, name=p.name, has_mask=t != "good" and (masks / t / f"{p.stem}_mask.png").is_file())
        for t, p in picked
    ]


@router.get("/files/{category}/{defect_type}/{name}", response_class=FileResponse)
def sample_image(category: str, defect_type: str, name: str) -> FileResponse:
    root = _root()
    path = _inside(root, _category_dir(root, category) / "test" / _part(defect_type, "defect type") / _part(name, "file name"))
    return FileResponse(path)


@router.get("/masks/{category}/{defect_type}/{name}", response_class=FileResponse)
def sample_mask(category: str, defect_type: str, name: str) -> FileResponse:
    """Ground-truth mask of a defective test image (the `<name>_mask.png` file)."""
    root = _root()
    stem = Path(_part(name, "file name")).stem
    path = _inside(root, _category_dir(root, category) / "ground_truth" / _part(defect_type, "defect type") / f"{stem}_mask.png")
    return FileResponse(path)


@router.get("/reference/{category}", response_class=FileResponse)
def reference(category: str) -> FileResponse:
    """The golden-template reference for a category: its first defect-free training image."""
    root = _root()
    images = _images(_category_dir(root, category) / "train" / "good")
    if not images:
        raise ApiError(404, f"category '{category}' has no train/good images")
    return FileResponse(_inside(root, images[0]))
