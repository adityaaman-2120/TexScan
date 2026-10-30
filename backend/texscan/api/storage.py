"""Stage images on disk: <data root>/<inspection id>/<name>.png"""

import os
import re
import shutil
from pathlib import Path

from texscan.db import REPO_ROOT
from texscan.imageio import write_image
from texscan.pipeline.types import Image

FILE_NAME = re.compile(r"^[a-z0-9_]+\.png$")


def data_root() -> Path:
    """data/inspections (override with TEXSCAN_DATA_DIR); read on every call so tests can redirect it."""
    root = Path(os.environ.get("TEXSCAN_DATA_DIR") or REPO_ROOT / "data" / "inspections")
    root.mkdir(parents=True, exist_ok=True)
    return root


def inspection_dir(inspection_id: int) -> Path:
    return data_root() / str(inspection_id)


def save_images(inspection_id: int, upload: Image, stages: dict[str, Image]) -> list[str]:
    """Write the original upload (as 'upload') and every stage image; returns the names written."""
    folder = inspection_dir(inspection_id)
    folder.mkdir(parents=True, exist_ok=True)
    images = {"upload": upload, **stages}
    for name, image in images.items():
        write_image(folder / f"{name}.png", image)
    return list(images)


def delete_images(inspection_id: int) -> None:
    shutil.rmtree(inspection_dir(inspection_id), ignore_errors=True)


def file_url(inspection_id: int, name: str) -> str:
    return f"/files/{inspection_id}/{name}.png"


def file_path(inspection_id: int, filename: str) -> Path | None:
    """Path of a stored image, or None if the name is not a plain '<stage>.png' or the file does not exist."""
    if not FILE_NAME.match(filename):
        return None
    path = inspection_dir(inspection_id) / filename
    return path if path.is_file() else None
