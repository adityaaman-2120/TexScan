"""Backend support for the Batch, History, Dashboard and Profiles pages."""

import json
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from tests.conftest import add_blob, make_noisy_material
from tests.test_api import (  # noqa: F401  (shared fixtures and helpers)
    autotune,
    clean,
    client,
    collect_events,
    defective,
    inspect,
    png,
)
from texscan.tuning import HISTOGRAM_BINS, ScoreHistogram, TuneReport, auto_tune

SMALL = json.dumps({"max_side": 256})


# --- /inspections filters ---------------------------------------------------------------------------
def test_search_is_case_insensitive_substring_and_escapes_wildcards(client: TestClient, clean: np.ndarray) -> None:
    for name in ("Denim_roll_01.png", "denim_roll_02.png", "ceramic.png", "100%_cotton.png"):
        inspect(client, clean, name)
    names = lambda **p: sorted(i["filename"] for i in client.get("/inspections", params=p).json()["items"])  # noqa: E731
    assert names(q="DENIM") == ["Denim_roll_01.png", "denim_roll_02.png"]
    assert names(q="roll_02") == ["denim_roll_02.png"]
    assert names(q="100%") == ["100%_cotton.png"]  # % is literal, not a wildcard
    assert names(q="%") == ["100%_cotton.png"]
    assert names(q="_roll") == ["Denim_roll_01.png", "denim_roll_02.png"]
    assert names(q="nothing-like-this") == []
    assert client.get("/inspections", params={"q": "x" * 201}).status_code == 422


def test_filter_by_method_and_batch_id_and_summary_exposes_batch(client: TestClient, clean: np.ndarray, defective: np.ndarray) -> None:
    inspect(client, clean, "a.png")
    inspect(client, defective, "b.png", method="local_statistics")
    assert [i["filename"] for i in client.get("/inspections", params={"method": "local_statistics"}).json()["items"]] == ["b.png"]
    assert client.get("/inspections", params={"method": "gabor"}).json()["total"] == 0

    files = [("images", (f"b{i}.png", png(clean), "image/png")) for i in range(2)]
    accepted = client.post("/inspect/batch", files=files, data={"config": SMALL}).json()
    collect_events(client, accepted["batch_id"])
    page = client.get("/inspections", params={"batch_id": accepted["batch_id"]}).json()
    assert page["total"] == 2 and {i["batch_id"] for i in page["items"]} == {accepted["batch_id"]}
    assert all(i["batch_id"] is None for i in client.get("/inspections", params={"q": "a.png"}).json()["items"])


def test_filters_combine(client: TestClient, clean: np.ndarray, defective: np.ndarray) -> None:
    inspect(client, clean, "ok-denim.png")
    inspect(client, defective, "bad-denim.png")
    inspect(client, defective, "bad-tile.png")
    res = client.get("/inspections", params={"q": "denim", "decision": "FAIL"}).json()
    assert [i["filename"] for i in res["items"]] == ["bad-denim.png"] and res["total"] == 1


# --- /stats additions --------------------------------------------------------------------------------
def test_stats_has_average_time_and_pass_rate_by_profile(client: TestClient, clean: np.ndarray, defective: np.ndarray) -> None:
    empty = client.get("/stats").json()
    assert empty["avg_processing_ms"] is None and empty["by_profile"] == []

    profile = autotune(client, "Denim").json()
    inspect(client, clean, "p1.png", profile_id=profile["id"], config="{}")
    inspect(client, defective, "p2.png", profile_id=profile["id"], config="{}")
    inspect(client, clean, "d1.png")
    inspect(client, clean, "d2.png")
    inspect(client, clean, "d3.png")
    stats = client.get("/stats").json()
    assert stats["avg_processing_ms"] > 0
    rows = {r["name"]: r for r in stats["by_profile"]}
    assert rows["Defaults"] == {"profile_id": None, "name": "Defaults", "total": 3, "passed": 3, "pass_rate": 1.0}
    assert rows["Denim"]["total"] == 2 and rows["Denim"]["passed"] == 1 and rows["Denim"]["pass_rate"] == pytest.approx(0.5)
    assert [r["total"] for r in stats["by_profile"]] == [3, 2]  # busiest first


def test_deleted_profiles_fold_into_defaults(client: TestClient, clean: np.ndarray) -> None:
    profile = autotune(client, "Temp").json()
    inspect(client, clean, "x.png", profile_id=profile["id"], config="{}")
    assert client.delete(f"/profiles/{profile['id']}").status_code == 204
    rows = client.get("/stats").json()["by_profile"]
    assert [(r["name"], r["total"]) for r in rows] == [("Defaults", 1)]


# --- score histogram in the tuning report -----------------------------------------------------------------
GOOD = [make_noisy_material(s) for s in range(6)]


def test_autotune_report_includes_the_score_histogram() -> None:
    from texscan.pipeline import PipelineConfig

    _, report = auto_tune(GOOD, PipelineConfig.model_validate({"max_side": 256}))
    h = report.score_histogram
    assert h is not None
    assert len(h.edges) == len(h.counts) + 1 and len(h.counts) <= HISTOGRAM_BINS
    assert h.edges[0] == 0 and all(b > a for a, b in zip(h.edges, h.edges[1:]))
    assert h.edges[-1] >= report.threshold * 1.5 - 1e-6  # the learned threshold is always on the chart
    peak_bin = h.counts.index(max(h.counts))
    assert h.edges[peak_bin + 1] < report.threshold  # the bulk of the good scores sits below the threshold


def test_old_reports_without_a_histogram_still_load() -> None:
    old = {
        "method": "fft", "threshold_param": "threshold.min_threshold", "threshold": 20.0, "quantile": 99.5,
        "score_percentiles": {"p50": 1.0}, "min_area": 100, "fp_component_count": 1, "fp_max_area": 5,
        "loo_pass_rate": 1.0, "n_images": 6, "warnings": [],
    }  # fmt: skip
    assert TuneReport.model_validate(old).score_histogram is None
    assert ScoreHistogram(edges=[0.0, 1.0], counts=[3], clipped=False).clipped is False


def test_profiles_api_returns_the_histogram(client: TestClient) -> None:
    body: dict[str, Any] = autotune(client, "Denim").json()
    hist = body["report"]["score_histogram"]
    assert len(hist["edges"]) == len(hist["counts"]) + 1 <= HISTOGRAM_BINS + 1 and hist["edges"][0] == 0
    assert hist["edges"][-1] > body["report"]["threshold"]
    assert client.get(f"/profiles/{body['id']}").json()["report"]["score_histogram"] == hist


def test_histogram_marks_clipped_outliers() -> None:
    from texscan.tuning import _histogram

    scores = np.concatenate([np.random.default_rng(0).normal(5, 1, 5000), [500.0]])
    h = _histogram(scores, threshold=8.0, p999=float(np.percentile(scores, 99.9)))
    assert h.clipped and h.counts[-1] >= 1 and sum(h.counts) == len(scores)
    assert not _histogram(np.full(100, 1.0), threshold=2.0, p999=1.0).clipped


def test_integer_scores_get_whole_number_bins_and_float_scores_get_the_full_resolution() -> None:
    from texscan.tuning import _histogram

    ints = np.random.default_rng(1).integers(0, 40, 20000).astype(float)
    h = _histogram(ints, threshold=30.0, p999=39.0)
    widths = {round(b - a, 6) for a, b in zip(h.edges, h.edges[1:])}
    assert widths == {1.0} and all(c > 0 for c in h.counts[:40])  # no empty comb teeth
    floats = np.random.default_rng(2).normal(5, 1, 20000)
    assert len(_hist := _histogram(floats, 8.0, float(np.percentile(floats, 99.9))).counts) == HISTOGRAM_BINS and sum(_hist) == 20000
