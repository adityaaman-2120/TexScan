import asyncio
import json
import time
from typing import Any

from fastapi import APIRouter, WebSocket
from sqlmodel import Session
from starlette.concurrency import run_in_threadpool
from starlette.websockets import WebSocketDisconnect

from texscan import db
from texscan.api.common import ApiError, decode_bytes, resolve_config, to_data_uri
from texscan.pipeline import PipelineConfig, run_pipeline

router = APIRouter(tags=["live"])
MIN_INTERVAL = 0.2  # seconds between processed frames -> at most 5 fps
LIVE_MAX_SIDE = 320  # default working resolution when no profile is chosen (keeps ~5 fps feasible)
_UNUSED = None  # default working resolution when no profile is chosen (keeps ~5 fps feasible)


def _region(crop: tuple[int, int, int, int], frame: tuple[int, int]) -> list[float]:
    """The inspected part of the received frame as fractions [x, y, w, h] (the whole frame unless borders were trimmed)."""
    h, w = frame
    x0, y0, x1, y1 = crop if crop != (0, 0, 0, 0) else (0, 0, w, h)
    return [x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h]


def process_frame(data: bytes, cfg: PipelineConfig) -> dict[str, Any]:
    start = time.perf_counter()
    try:
        image = decode_bytes(data, "frame")
    except ApiError as exc:
        return {"type": "error", "message": exc.detail}
    result = run_pipeline(image, cfg)
    height, width = result.stages["gray"].shape
    return {
        "type": "result",
        "region": _region(result.crop, image.shape[:2]),
        "width": width,  # size the pipeline worked at: defect boxes are in these pixels
        "height": height,
        "decision": result.decision,
        "defect_count": len(result.defects),
        "defect_area_percent": result.defect_area_percent,
        "defects": [
            {"bbox": d.bbox, "defect_type": d.defect_type, "type_confidence": d.type_confidence} for d in result.defects
        ],
        "overlay": to_data_uri(result.stages["overlay"], "jpeg", 70),
        "process_ms": (time.perf_counter() - start) * 1000,
    }


def _live_config(method: str, profile_id: int | None, max_side: int | None, center: float | None = None) -> PipelineConfig:
    overrides: dict[str, object] = {"max_side": max_side} if max_side else ({} if profile_id is not None else {"max_side": LIVE_MAX_SIDE})
    if center is not None:
        overrides["center_fraction"] = center
    overrides["trim_borders"] = True  # camera frames often carry black bars (a phone relayed as a webcam), which are not a defect
    with Session(db.engine) as session:
        cfg = resolve_config(session, profile_id, method, json.dumps(overrides))
    if cfg.method == "golden_template":
        raise ApiError(422, "golden_template needs a reference image and is not available on /ws/live")
    return cfg


@router.websocket("/ws/live")
async def live(
    ws: WebSocket, method: str = "fft", profile_id: int | None = None, max_side: int | None = None, center: float | None = None
) -> None:
    """Send binary JPEG frames; get one JSON result per processed frame.

    Only the newest frame is processed (older ones are dropped) and at most one every 200 ms (~5 fps).
    """
    await ws.accept()
    try:
        cfg = _live_config(method, profile_id, max_side, center)
    except ApiError as exc:
        await ws.send_json({"type": "error", "message": exc.detail})
        await ws.close(code=1008)
        return

    latest: bytes | None = None
    fresh, closed = asyncio.Event(), asyncio.Event()

    async def reader() -> None:
        nonlocal latest
        while True:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                break
            if message.get("bytes") is not None:
                latest = message["bytes"]
                fresh.set()
        closed.set()
        fresh.set()

    reader_task = asyncio.create_task(reader())
    last_started = 0.0
    try:
        while not closed.is_set():
            await fresh.wait()
            fresh.clear()
            wait = MIN_INTERVAL - (time.monotonic() - last_started)
            if wait > 0:
                await asyncio.sleep(wait)  # newer frames overwrite `latest` meanwhile
            frame, latest = latest, None
            if frame is None or closed.is_set():
                continue
            last_started = time.monotonic()
            await ws.send_json(await run_in_threadpool(process_frame, frame, cfg))
    except WebSocketDisconnect:
        pass
    finally:
        reader_task.cancel()
