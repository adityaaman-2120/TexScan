"""Rule-based defect typing (no ML): fuzzy rules over the shape/contrast features of each defect."""

from typing import Literal

import numpy as np
from pydantic import BaseModel

from texscan.pipeline.types import Defect, DefectType

MIN_CONFIDENCE = 0.5  # below this no rule set matched well enough -> "unknown"
NEUTRAL = 0.5  # strength of a contrast rule when no gray image was available


class Classification(BaseModel):
    label: DefectType
    confidence: float  # winner's score; for "unknown": 1 - best score (how sure that nothing fits)
    scores: dict[str, float]  # per-type rule score, 0..1


def _ramp(x: float, zero_at: float, one_at: float) -> float:
    """Linear membership: 0 at `zero_at`, 1 at `one_at`, clipped. Works in either direction."""
    return float(np.clip((x - zero_at) / (one_at - zero_at), 0.0, 1.0))


def _match(strengths: list[float]) -> float:
    """Every rule must fire at least a little (else 0); the score is the mean strength."""
    return 0.0 if min(strengths) == 0 else float(np.mean(strengths))


def classify_defect(d: Defect) -> Classification:
    """Score the defect against every type's rules; the best score wins if it reaches MIN_CONFIDENCE.

    Thresholds are in pixels of the normalized (max_side) image. Contrast is relative to the surrounding ring.
    """
    # Derived measurements ------------------------------------------------------------------------
    # Line width: for a thin strip, area = length * width and perimeter ~ 2 * length, so width ~ 2 * area / perimeter.
    width = 2 * d.area / d.perimeter if d.perimeter > 0 else float(min(d.bbox[2:]))
    known = d.contrast is not None
    contrast = d.contrast or 0.0

    # Reusable fuzzy facts (each 0..1) ------------------------------------------------------------
    darker = _ramp(contrast, -10, -50) if known else NEUTRAL  # clearly darker than surroundings
    strong = _ramp(abs(contrast), 20, 60) if known else NEUTRAL  # high-contrast, either polarity
    lighter = _ramp(contrast, 10, 50) if known else NEUTRAL  # clearly brighter than surroundings
    faint = 1 - strong  # low-contrast, either polarity
    round_shape = _ramp(d.aspect_ratio, 2.5, 1.5)  # 1 when ~circular, 0 when 2.5x longer than wide
    smooth_edge = _ramp(d.solidity, 0.7, 0.9)  # 1 when (nearly) convex, 0 when ragged
    ragged_edge = 1 - smooth_edge

    scores: dict[str, float] = {
        # HOLE: compact, round, convex and darker than the cloth around it (we see through / into it).
        "hole": _match([darker, round_shape, smooth_edge]),
        # TEAR / LINE: clearly elongated and high contrast (a deep slit, cut or scratch stands out).
        "tear_line": _match([_ramp(d.aspect_ratio, 2.5, 5.0), strong]),
        # THREAD / FIBER: very elongated AND very thin AND faint (a loose yarn or lint lying on the surface).
        "thread_fiber": _match([_ramp(d.aspect_ratio, 4.0, 8.0), _ramp(width, 12, 4), faint]),
        # STAIN: a sizeable, not-elongated blotch that is faint, ragged-edged or lighter than the cloth
        # (soaked-in, bleeding or bleached). Dark + round + sharp is a HOLE instead.
        "stain": _match([_ramp(d.aspect_ratio, 3.5, 2.0), _ramp(d.area, 100, 400), max(faint, ragged_edge, lighter)]),
    }

    # Decision ------------------------------------------------------------------------------------
    best = max(scores, key=lambda k: scores[k])
    if scores[best] < MIN_CONFIDENCE:
        return Classification(label="unknown", confidence=1 - scores[best], scores=scores)
    label: Literal["hole", "tear_line", "stain", "thread_fiber"] = best  # type: ignore[assignment]
    return Classification(label=label, confidence=scores[best], scores=scores)


def classify_defects(defects: list[Defect]) -> list[Defect]:
    """Return copies of the defects with defect_type and type_confidence filled in."""
    out = []
    for d in defects:
        c = classify_defect(d)
        out.append(d.model_copy(update={"defect_type": c.label, "type_confidence": round(c.confidence, 4)}))
    return out
