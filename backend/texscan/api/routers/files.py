from fastapi import APIRouter
from fastapi.responses import FileResponse

from texscan.api import storage
from texscan.api.common import ApiError

router = APIRouter(tags=["files"])


@router.get("/files/{inspection_id}/{filename}", response_class=FileResponse)
def stage_image(inspection_id: int, filename: str) -> FileResponse:
    """Stored stage images, e.g. /files/12/overlay.png. Only plain '<stage>.png' names are served."""
    path = storage.file_path(inspection_id, filename)
    if path is None:
        raise ApiError(404, f"no image '{filename}' for inspection {inspection_id}")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})
