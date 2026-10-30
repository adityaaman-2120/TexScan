import time
from datetime import UTC, datetime

import numpy as np
from fastapi.testclient import TestClient

from tests.test_api import SMALL, autotune, clean, client, defective, inspect, png  # noqa: F401 - fixtures
from texscan.api import storage
from texscan.api.schemas import InspectionOut
from texscan.report import BatchItem, BatchReportData, InspectionReportData, batch_report
from texscan.report.batch import summary, type_totals
from texscan.report.inspection import config_rows


def item(decision: str = "PASS", defects: int = 0, types: dict[str, int] | None = None, area: float = 0.0) -> BatchItem:
    return BatchItem(1, "a.png", decision, defects, area, 10.0, types or {})


def is_pdf(response) -> bool:  # type: ignore[no-untyped-def]
    return response.status_code == 200 and response.headers["content-type"] == "application/pdf" and response.content.startswith(b"%PDF-") and response.content.rstrip().endswith(b"%%EOF")


def test_summary_counts_and_rates() -> None:
    items = [item("PASS"), item("FAIL", 3, {"hole": 2, "stain": 1}, 2.0), item("FAIL", 1, {"hole": 1}, 1.0), item("PASS")]
    s = summary(items)
    assert (s["total"], s["passed"], s["failed"], s["defects"]) == (4, 2, 2, 4)
    assert s["pass_rate"] == 50.0 and s["mean_area"] == 0.75 and s["mean_ms"] == 10.0


def test_summary_of_an_empty_batch_has_no_division_by_zero() -> None:
    assert summary([])["pass_rate"] == 0.0


def test_type_totals_add_up_across_items() -> None:
    totals = type_totals([item("FAIL", 3, {"hole": 2, "stain": 1}), item("FAIL", 1, {"hole": 1})])
    assert totals == {"hole": 3, "stain": 1}


def test_batch_report_renders_with_no_overlays_and_hostile_file_names() -> None:
    items = [item("FAIL", 1, {"hole": 1}, 1.5), item("PASS")]
    items[0].filename = "<b>&\"x\".png"
    now = datetime.now(UTC)
    pdf = batch_report(BatchReportData("abcdef012345", items, "fft", None, now, now))
    assert pdf.startswith(b"%PDF-")


def test_batch_report_paginates_a_hundred_items() -> None:
    now = datetime.now(UTC)
    pdf = batch_report(BatchReportData("b" * 32, [item("PASS") for _ in range(100)], "gabor", "Denim", now, now))
    assert pdf.count(b"/Type /Page\n") >= 2


def test_config_rows_only_list_the_chosen_methods_settings(client: TestClient, clean: np.ndarray) -> None:  # noqa: F811
    for method, shown, hidden in (("fft", "peaks / ", "gabor / "), ("gabor", "gabor / ", "peaks / ")):
        out = InspectionOut.model_validate(inspect(client, clean, method=method).json())
        keys = [k for k, _ in config_rows(InspectionReportData(out, None))]
        assert any(k.startswith(shown) for k in keys) and not any(k.startswith(hidden) for k in keys)
        assert keys[0] == "method"


def test_inspection_report_for_a_failing_and_a_passing_image(client: TestClient, clean: np.ndarray, defective: np.ndarray) -> None:  # noqa: F811
    bad = inspect(client, defective, "bad.png").json()
    ok = inspect(client, clean, "ok.png").json()
    for payload in (bad, ok):
        response = client.get(f"/inspections/{payload['id']}/report.pdf")
        assert is_pdf(response)
        assert f"texscan-inspection-{payload['id']}.pdf" in response.headers["content-disposition"]
        assert len(response.content) > 20_000  # carries the images


def test_inspection_report_survives_missing_stage_images_and_a_deleted_profile(client: TestClient, defective: np.ndarray, tmp_path) -> None:  # noqa: F811
    profile_id = autotune(client).json()["id"]
    payload = inspect(client, defective, profile_id=profile_id, config="{}").json()
    client.delete(f"/profiles/{profile_id}")
    for url in payload["stage_urls"].values():
        if not url.endswith("upload.png"):
            path = storage.file_path(payload["id"], url.rsplit("/", 1)[1])
            path and path.unlink()
    assert is_pdf(client.get(f"/inspections/{payload['id']}/report.pdf"))


def test_report_404s(client: TestClient) -> None:
    assert client.get("/inspections/999/report.pdf").status_code == 404
    assert client.get("/batches/nope/report.pdf").status_code == 404


def test_batch_report_endpoint(client: TestClient, clean: np.ndarray, defective: np.ndarray) -> None:  # noqa: F811
    files = [("images", (f"f{i}.png", png(img), "image/png")) for i, img in enumerate([defective, clean, defective])]
    accepted = client.post("/inspect/batch", files=files, data={"config": SMALL}).json()
    for _ in range(100):
        if client.get(f"/inspect/batch/{accepted['batch_id']}").json()["status"] == "complete":
            break
        time.sleep(0.2)
    response = client.get(f"/batches/{accepted['batch_id']}/report.pdf")
    assert is_pdf(response) and f"texscan-batch-{accepted['batch_id'][:8]}.pdf" in response.headers["content-disposition"]
