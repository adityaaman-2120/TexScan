"""Shared helpers: errors, upload decoding, data URIs, config resolution."""

import base64
import json
from typing import Any

import cv2
import numpy as np
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError
from sqlmodel import Session

from texscan.models import Profile
from texscan.pipeline import PipelineConfig
from texscan.pipeline.load import to_gray
from texscan.pipeline.types import Image
from texscan.profiles import ProfileNotFoundError, profile_config

MAX_BYTES = 25 * 1024 * 1024
MAX_SIDE = 12_000
FORMATS = "PNG, JPEG, BMP, TIFF or WebP"


class ApiError(HTTPException):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(status_code=status, detail=message)


def decode_bytes(data: bytes, name: str) -> Image:
    """Decode an uploaded image to uint8 BGR, with a human-readable error for anything unusable."""
    if not data:
        raise ApiError(422, f"'{name}' is empty")
    if len(data) > MAX_BYTES:
        raise ApiError(413, f"'{name}' is larger than {MAX_BYTES // 2**20} MB")
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ApiError(422, f"'{name}' is not a readable image (supported: {FORMATS})")
    if max(image.shape[:2]) > MAX_SIDE:
        raise ApiError(422, f"'{name}' is {image.shape[1]}x{image.shape[0]} px; the limit is {MAX_SIDE} px per side")
    return image


def read_upload(file: UploadFile) -> Image:
    return decode_bytes(file.file.read(MAX_BYTES + 1), file.filename or "upload")


def read_mask(file: UploadFile, shape: tuple[int, int]) -> np.ndarray:
    """A drawn/ground-truth mask as uint8 0/255 at `shape` (nearest-neighbour resize)."""
    gray = to_gray(read_upload(file))
    h, w = shape
    if gray.shape != shape:
        gray = cv2.resize(gray, (w, h), interpolation=cv2.INTER_NEAREST)
    return gray


def to_data_uri(image: Image, fmt: str = "png", quality: int = 88) -> str:
    ext, mime = (".png", "image/png") if fmt == "png" else (".jpg", "image/jpeg")
    params = [] if fmt == "png" else [cv2.IMWRITE_JPEG_QUALITY, quality]
    ok, buf = cv2.imencode(ext, image, params)
    if not ok:
        raise ApiError(500, "could not encode result image")
    return f"data:{mime};base64,{base64.b64encode(buf.tobytes()).decode()}"


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key, value in override.items():
        out[key] = deep_merge(out[key], value) if isinstance(value, dict) and isinstance(out.get(key), dict) else value
    return out


def parse_json_object(text: str | None, field: str = "config") -> dict[str, Any]:
    if not text or not text.strip():
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ApiError(422, f"'{field}' is not valid JSON: {exc.msg}") from exc
    if not isinstance(value, dict):
        raise ApiError(422, f"'{field}' must be a JSON object")
    return value


def _validation_message(exc: ValidationError) -> str:
    return "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())


def get_profile_or_404(session: Session, profile_id: int) -> Profile:
    profile = session.get(Profile, profile_id)
    if profile is None:
        raise ApiError(404, f"no profile with id {profile_id}")
    return profile


def resolve_config(
    session: Session, profile_id: int | None, method: str | None, overrides_json: str | None
) -> PipelineConfig:
    """Config precedence: defaults < profile < `config` JSON overrides < explicit `method`."""
    try:
        base = (
            profile_config(get_profile_or_404(session, profile_id)) if profile_id is not None else PipelineConfig()
        ).model_dump()
    except ProfileNotFoundError as exc:  # pragma: no cover - get_profile_or_404 already covers it
        raise ApiError(404, str(exc)) from exc
    merged = deep_merge(base, parse_json_object(overrides_json))
    if method:
        merged["method"] = method
    try:
        return PipelineConfig.model_validate(merged)
    except ValidationError as exc:
        raise ApiError(422, f"invalid config: {_validation_message(exc)}") from exc


def require_reference(config: PipelineConfig, reference: UploadFile | None) -> Image | None:
    if reference is not None:
        return read_upload(reference)
    if config.method == "golden_template":
        raise ApiError(422, "method 'golden_template' needs a reference image (form field 'reference')")
    return None
