"""Stateless analysis endpoints: nothing is stored; images come back as data URIs."""

from concurrent.futures import ThreadPoolExecutor
from typing import Annotated, Literal

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlmodel import Session

from texscan.api.common import (
    ApiError,
    parse_json_object,
    read_mask,
    read_upload,
    require_reference,
    resolve_config,
    to_data_uri,
)
from texscan.api.schemas import (
    ArenaMethodResult,
    ArenaOut,
    Peak,
    RobustnessOut,
    RobustnessPoint,
    SpectrumApplyOut,
    SpectrumOut,
)
from texscan.db import get_session
from texscan.eval.metrics import dice, iou, pixel_prf
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.classify import classify_defects
from texscan.pipeline.defects import extract_defects
from texscan.pipeline.denoise import denoise
from texscan.pipeline.detectors import DETECTORS
from texscan.pipeline.enhance import enhance
from texscan.pipeline.load import load_and_normalize, resize_longest, to_gray
from texscan.pipeline.notch import FilterKind, FilterResponse, apply_frequency_mask, mask_to_filter, radial_filter
from texscan.pipeline.overlay import edges_overlay
from texscan.pipeline.runner import decide
from texscan.pipeline.segment import morphology_cleanup, residual_to_mask
from texscan.pipeline.spectrum import detect_periodic_peaks, fft_spectrum, magnitude_spectrum, mark_peaks
from texscan.pipeline.types import Image
from texscan.pipeline.utils import to_uint8
from texscan.robustness import DEGRADATIONS, sweep

router = APIRouter(tags=["analysis"])

MAX_LEVELS, MAX_SWEEP_RUNS = 12, 40
LEVEL_MEANING = {
    "gaussian_noise": "noise sigma (gray levels)",
    "blur": "gaussian blur sigma (px)",
    "brightness": "brightness shift (gray levels)",
    "jpeg_quality": "JPEG quality (1-100)",
}


def _enhanced(image: Image, cfg: PipelineConfig) -> Image:
    """Same preprocessing as the pipeline, so spectrum coordinates line up with what the FFT method sees."""
    gray = load_and_normalize(image, cfg.max_side)
    return enhance(denoise(gray, **cfg.denoise.model_dump()), **cfg.enhance.model_dump())[0]


@router.post("/spectrum", response_model=SpectrumOut)
def spectrum(
    image: Annotated[UploadFile, File()],
    profile_id: Annotated[int | None, Form()] = None,
    config: Annotated[str | None, Form(description="JSON PipelineConfig overrides (max_side, peaks.*, ...)")] = None,
    session: Session = Depends(get_session),
) -> SpectrumOut:
    """Log-magnitude spectrum (DC at the centre) and the periodic peaks the FFT method would notch out."""
    cfg = resolve_config(session, profile_id, "fft", config)
    spec, freq = fft_spectrum(_enhanced(read_upload(image), cfg))
    peaks = detect_periodic_peaks(magnitude_spectrum(freq), **cfg.peaks.model_dump())
    return SpectrumOut(
        width=spec.shape[1],
        height=spec.shape[0],
        spectrum=to_data_uri(spec),
        spectrum_peaks=to_data_uri(mark_peaks(spec, peaks)),
        peaks=[Peak(row=int(r), col=int(c), x=int(c), y=int(r)) for r, c in peaks],
    )


@router.post("/spectrum/apply", response_model=SpectrumApplyOut)
def spectrum_apply(
    image: Annotated[UploadFile, File()],
    mask: Annotated[UploadFile | None, File(description="PNG the size of the spectrum; white = reject these frequencies")] = None,
    profile_id: Annotated[int | None, Form()] = None,
    config: Annotated[str | None, Form()] = None,
    feather: Annotated[float, Form(ge=0, le=20)] = 2.0,
    symmetric: Annotated[bool, Form(description="mirror the drawn mask through the centre")] = True,
    filter_kind: Annotated[Literal["none", "lowpass", "highpass", "sharpen"], Form(description="radial preset, combined with the mask")] = "none",
    filter_response: Annotated[Literal["ideal", "butterworth", "gaussian"], Form()] = "gaussian",
    cutoff: Annotated[float, Form(gt=0, description="preset cutoff radius in spectrum pixels")] = 30.0,
    order: Annotated[int, Form(ge=1, le=10, description="Butterworth order")] = 2,
    session: Session = Depends(get_session),
) -> SpectrumApplyOut:
    """Filter with a hand-drawn notch mask (mirrored unless symmetric=false) and/or a low/high-pass preset, then threshold the result into defects."""
    cfg = resolve_config(session, profile_id, "fft", config)
    upload = read_upload(image)
    enhanced = _enhanced(upload, cfg)
    drawn = read_mask(mask, enhanced.shape) if mask is not None else np.zeros(enhanced.shape, np.uint8)
    gain = mask_to_filter(drawn, feather, symmetric)
    if filter_kind != "none":
        gain = gain * radial_filter(enhanced.shape, _kind(filter_kind), _response(filter_response), cutoff, order)
    filtered = apply_frequency_mask(enhanced, gain)
    magnitude, raw = residual_to_mask(filtered, **cfg.threshold.model_dump())
    clean = morphology_cleanup(raw, **cfg.morphology.model_dump())
    gray = load_and_normalize(upload, cfg.max_side)
    defects = classify_defects(extract_defects(clean, gray))
    percent = 100.0 * float((clean > 0).sum()) / clean.size
    overlay = edges_overlay(resize_longest(upload, cfg.max_side), clean)
    return SpectrumApplyOut(
        decision=decide(defects, percent, cfg),
        defects=defects,
        defect_area_percent=percent,
        residual=to_data_uri(to_uint8(filtered)),
        mask=to_data_uri(clean),
        overlay=to_data_uri(overlay, "jpeg"),
    )


def _kind(value: str) -> FilterKind:
    return value  # type: ignore[return-value]  # already validated by the Literal form field


def _response(value: str) -> FilterResponse:
    return value  # type: ignore[return-value]


def _arena_one(method: str, image: Image, base: PipelineConfig, reference: Image | None, gt: Image | None) -> ArenaMethodResult:
    cfg = base.model_copy(update={"method": method})
    if method == "golden_template" and reference is None:
        return ArenaMethodResult(method=method, status="skipped", message="needs a reference image")
    try:
        result = run_pipeline(image, cfg, reference)
    except Exception as exc:  # noqa: BLE001 - one failing method must not hide the others
        return ArenaMethodResult(method=method, status="error", message=f"{type(exc).__name__}: {exc}")
    mask = result.stages["mask_clean"]
    out = ArenaMethodResult(
        method=method, status="ok", decision=result.decision, defects=result.defects,
        defect_area_percent=result.defect_area_percent, total_ms=sum(result.timings_ms.values()),
        overlay=to_data_uri(result.stages["overlay"], "jpeg"), mask=to_data_uri(mask),
    )  # fmt: skip
    if gt is not None:
        gt_bool = cv2.resize(gt, (mask.shape[1], mask.shape[0]), interpolation=cv2.INTER_NEAREST) > 0
        out.iou, out.dice = iou(mask > 0, gt_bool), dice(mask > 0, gt_bool)
        out.precision, out.recall, out.f1 = pixel_prf(mask > 0, gt_bool)
        out.correct = (result.decision == "FAIL") == bool(gt_bool.any())
    return out


@router.post("/arena", response_model=ArenaOut)
def arena(
    image: Annotated[UploadFile, File()],
    ground_truth: Annotated[UploadFile | None, File(description="optional mask, white = defect")] = None,
    reference: Annotated[UploadFile | None, File(description="good image for golden_template")] = None,
    methods: Annotated[str | None, Form(description="comma list; default: all")] = None,
    config: Annotated[str | None, Form(description="JSON overrides applied to every method")] = None,
    session: Session = Depends(get_session),
) -> ArenaOut:
    """Run several methods on one image with default settings and compare them (with IoU/Dice if a mask is given)."""
    base = resolve_config(session, None, None, config)
    chosen = [m.strip() for m in methods.split(",") if m.strip()] if methods else list(DETECTORS)
    unknown = [m for m in chosen if m not in DETECTORS]
    if unknown or not chosen:
        raise ApiError(422, f"unknown method(s) {unknown or methods!r}; choose from {sorted(DETECTORS)}")
    upload = read_upload(image)
    ref = read_upload(reference) if reference is not None else None
    gt = to_gray(read_upload(ground_truth)) if ground_truth is not None else None
    with ThreadPoolExecutor(max_workers=len(chosen)) as pool:
        results = list(pool.map(lambda m: _arena_one(m, upload, base, ref, gt), chosen))
    return ArenaOut(
        ground_truth_provided=gt is not None,
        ground_truth_defective=None if gt is None else bool((gt > 0).any()),
        results=results,
    )


THUMB_SIDE = 128


def _thumbnail(image: Image) -> str:
    return to_data_uri(resize_longest(image, THUMB_SIDE), "jpeg", 80)


def _point(raw: dict) -> RobustnessPoint:  # type: ignore[type-arg]
    point = {k: v for k, v in raw.items() if k != "image"}
    return RobustnessPoint(**point, thumbnail=_thumbnail(raw["image"]))


def _parse_levels(kinds: list[str], levels_json: str | None) -> dict[str, list[float]]:
    given = parse_json_object(levels_json, "levels")
    out: dict[str, list[float]] = {}
    for kind in kinds:
        raw = given.get(kind, DEGRADATIONS[kind][2])
        if not isinstance(raw, list) or not raw or not all(isinstance(v, (int, float)) for v in raw):
            raise ApiError(422, f"levels for '{kind}' must be a non-empty list of numbers")
        if len(raw) > MAX_LEVELS:
            raise ApiError(422, f"at most {MAX_LEVELS} levels per degradation ('{kind}' has {len(raw)})")
        if kind == "jpeg_quality" and not all(1 <= v <= 100 for v in raw):
            raise ApiError(422, "jpeg_quality levels must be between 1 and 100")
        if kind in ("gaussian_noise", "blur") and any(v < 0 for v in raw):
            raise ApiError(422, f"levels for '{kind}' must be >= 0")
        out[kind] = [float(v) for v in raw]
    if sum(map(len, out.values())) > MAX_SWEEP_RUNS:
        raise ApiError(422, f"too many pipeline runs requested (limit {MAX_SWEEP_RUNS})")
    return out


@router.post("/robustness", response_model=RobustnessOut)
def robustness(
    image: Annotated[UploadFile, File()],
    reference: Annotated[UploadFile | None, File()] = None,
    degradations: Annotated[str | None, Form(description=f"comma list of {sorted(DEGRADATIONS)}; default: all")] = None,
    levels: Annotated[str | None, Form(description='JSON, e.g. {"gaussian_noise": [0, 10, 30]}')] = None,
    profile_id: Annotated[int | None, Form()] = None,
    method: Annotated[str | None, Form()] = None,
    config: Annotated[str | None, Form()] = None,
    session: Session = Depends(get_session),
) -> RobustnessOut:
    """Re-run the pipeline on increasingly degraded copies of the image; shows where the verdict flips."""
    cfg = resolve_config(session, profile_id, method, config)
    kinds = [k.strip() for k in degradations.split(",") if k.strip()] if degradations else list(DEGRADATIONS)
    bad = [k for k in kinds if k not in DEGRADATIONS]
    if bad or not kinds:
        raise ApiError(422, f"unknown degradation(s) {bad or degradations!r}; choose from {sorted(DEGRADATIONS)}")
    plan = _parse_levels(kinds, levels)
    ref = require_reference(cfg, reference)
    upload = read_upload(image)
    base = resize_longest(upload, cfg.max_side)
    with ThreadPoolExecutor(max_workers=len(plan)) as pool:
        futures = {k: pool.submit(sweep, upload, cfg, k, lv, ref) for k, lv in plan.items()}
        series = {k: [_point(p) for p in f.result()] for k, f in futures.items()}
    return RobustnessOut(
        method=cfg.method,
        raw_bytes=int(base.size),
        original_thumbnail=_thumbnail(base),
        series=series,
        parameters={k: LEVEL_MEANING[k] for k in plan},
    )

