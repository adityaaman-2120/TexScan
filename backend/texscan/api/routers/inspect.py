import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, WebSocket
from sqlmodel import Session

from texscan.api import batches
from texscan.api.common import ApiError, decode_bytes, read_upload, require_reference, resolve_config
from texscan.api.schemas import BatchAccepted, BatchStatus, InspectionOut, RejectedFile
from texscan.api.service import inspection_out, store_inspection
from texscan.db import get_session

router = APIRouter(tags=["inspect"])
MAX_BATCH = 100


@router.post("/inspect", response_model=InspectionOut, status_code=201)
def inspect(
    image: Annotated[UploadFile, File(description="PNG / JPEG / BMP / TIFF / WebP")],
    reference: Annotated[UploadFile | None, File(description="known-good image, only for golden_template")] = None,
    profile_id: Annotated[int | None, Form()] = None,
    method: Annotated[str | None, Form(description="fft | gabor | golden_template | local_statistics")] = None,
    config: Annotated[str | None, Form(description="JSON object with PipelineConfig overrides")] = None,
    session: Session = Depends(get_session),
) -> InspectionOut:
    """Run the pipeline, store the original and every stage image, and return the full result."""
    cfg = resolve_config(session, profile_id, method, config)
    ref = require_reference(cfg, reference)
    row = store_inspection(session, read_upload(image), image.filename or "upload", cfg, profile_id, ref)
    return inspection_out(row)


@router.post("/inspect/batch", response_model=BatchAccepted, status_code=202)
def inspect_batch(
    images: Annotated[list[UploadFile], File(description="one or more images")],
    reference: Annotated[UploadFile | None, File()] = None,
    profile_id: Annotated[int | None, Form()] = None,
    method: Annotated[str | None, Form()] = None,
    config: Annotated[str | None, Form()] = None,
    session: Session = Depends(get_session),
) -> BatchAccepted:
    """Queue images for processing. Unreadable files are listed in `rejected`; follow progress on /ws/batch/{id}."""
    if not 1 <= len(images) <= MAX_BATCH:
        raise ApiError(422, f"send between 1 and {MAX_BATCH} images, got {len(images)}")
    cfg = resolve_config(session, profile_id, method, config)
    ref = require_reference(cfg, reference)
    items, rejected = [], []
    for upload in images:
        name = upload.filename or "upload"
        try:
            items.append((name, decode_bytes(upload.file.read(), name)))
        except ApiError as exc:
            rejected.append(RejectedFile(filename=name, reason=str(exc.detail)))
    if not items:
        raise ApiError(422, "none of the files could be read: " + "; ".join(r.reason for r in rejected))
    batch = batches.start_batch(items, cfg, profile_id, ref)
    return BatchAccepted(batch_id=batch.id, total=batch.total, rejected=rejected, ws_url=f"/ws/batch/{batch.id}")


@router.get("/inspect/batch/{batch_id}", response_model=BatchStatus)
def batch_status(batch_id: str) -> BatchStatus:
    batch = batches.get_batch(batch_id)
    if batch is None:
        raise ApiError(404, f"no batch {batch_id}")
    return BatchStatus(
        batch_id=batch.id,
        status="complete" if batch.complete else "running",
        total=batch.total,
        done=batch.done,
        inspection_ids=list(batch.inspection_ids),
        errors=[RejectedFile(**e) for e in batch.errors],
    )


@router.websocket("/ws/batch/{batch_id}")
async def batch_progress(ws: WebSocket, batch_id: str) -> None:
    """Streams {"type": "progress", ...} per image then {"type": "complete", ...}. Late joiners get the full history."""
    await ws.accept()
    batch = batches.get_batch(batch_id)
    if batch is None:
        await ws.send_json({"type": "error", "message": f"no batch {batch_id}"})
        await ws.close(code=4404)
        return
    sent = 0
    while True:
        for event in batch.events_since(sent):
            await ws.send_json(event)
            sent += 1
            if event["type"] == "complete":
                await ws.close()
                return
        await asyncio.sleep(0.05)
