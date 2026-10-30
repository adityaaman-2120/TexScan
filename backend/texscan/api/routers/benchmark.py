"""The benchmark table written by `make eval` (data/results/metrics.json)."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import ValidationError

from texscan.api.schemas import BenchmarkMeta, BenchmarkOut, CategoryMetrics
from texscan.db import REPO_ROOT

router = APIRouter(tags=["benchmark"])

SOURCES = {"mvtec": "metrics.json", "synthetic": "synthetic/metrics.json"}
HINT = {
    "mvtec": "No benchmark yet. Download MVTec AD, set MVTEC_PATH and run `make eval` (see the README).",
    "synthetic": "No synthetic smoke-test results. Run `make eval-demo`.",
}


def results_dir() -> Path:
    """data/results (override with TEXSCAN_RESULTS_DIR); read on every call so tests can redirect it."""
    return Path(os.environ.get("TEXSCAN_RESULTS_DIR") or REPO_ROOT / "data" / "results")


@router.get("/benchmark", response_model=BenchmarkOut)
def benchmark(source: Annotated[Literal["mvtec", "synthetic"], Query()] = "mvtec") -> BenchmarkOut:
    """Per-method, per-category metrics from the last evaluation run. A missing or unreadable file is reported, not raised."""
    path = results_dir() / SOURCES[source]
    if not path.is_file():
        return BenchmarkOut(source=source, available=False, message=HINT[source])
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        results = {m: {c: CategoryMetrics.model_validate(v) for c, v in per.items()} for m, per in raw["results"].items()}
        meta = BenchmarkMeta.model_validate(raw.get("meta", {}))
    except (OSError, ValueError, KeyError, TypeError, ValidationError) as exc:
        return BenchmarkOut(source=source, available=False, message=f"{path.name} could not be read: {type(exc).__name__}: {exc}"[:300])
    return BenchmarkOut(
        source=source,
        available=bool(results),
        message=None if results else "The results file contains no methods.",
        generated_at=datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc),
        meta=meta,
        results=results,
    )
