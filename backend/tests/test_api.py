import base64
import json
import time
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from tests.conftest import add_blob, make_noisy_material, make_texture
from texscan import db
from texscan.main import app

SMALL = json.dumps({"max_side": 256})  # tests use 256 px images; keeps every call fast
BLOB = (60, 200, 10)  # row, col, radius


def png(image: np.ndarray, ext: str = ".png") -> bytes:
    ok, buf = cv2.imencode(ext, image)
    assert ok
    return buf.tobytes()


def decode_uri(uri: str) -> np.ndarray:
    assert uri.startswith("data:image/")
    arr = np.frombuffer(base64.b64decode(uri.split(",", 1)[1]), np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)


@pytest.fixture
def clean() -> np.ndarray:
    return make_texture("sinusoid")


@pytest.fixture
def defective(clean: np.ndarray) -> np.ndarray:
    return add_blob(clean, BLOB[:2], BLOB[2])


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("TEXSCAN_DATA_DIR", str(tmp_path / "files"))
    monkeypatch.setattr(db, "engine", db.make_engine(f"sqlite:///{tmp_path / 'test.db'}"))
    with TestClient(app) as c:
        yield c


def inspect(client: TestClient, image: np.ndarray, name: str = "a.png", **form: Any) -> Any:
    form = {"config": SMALL, **form}
    return client.post("/inspect", files={"image": (name, png(image), "image/png")}, data=form)


def autotune(client: TestClient, name: str = "Denim", n: int = 6, **form: Any) -> Any:
    files = [("images", (f"g{i}.png", png(make_noisy_material(i)), "image/png")) for i in range(n)]
    return client.post("/profiles/autotune", files=files, data={"name": name, "config": SMALL, **form})


# --- POST /inspect ----------------------------------------------------------------------------
def test_inspect_defective_image_returns_everything(client: TestClient, defective: np.ndarray) -> None:
    res = inspect(client, defective, "fabric.png")
    assert res.status_code == 201
    body = res.json()
    assert body["decision"] == "FAIL" and body["filename"] == "fabric.png" and body["method"] == "fft"
    defect = body["defects"][0]
    assert defect["defect_type"] == "hole" and 0.5 < defect["type_confidence"] <= 1
    assert body["metrics"]["defect_count"] == len(body["defects"]) >= 1
    assert body["metrics"]["largest_defect_area"] == max(d["area"] for d in body["defects"])
    assert body["metrics"]["image_width"] == 256 and body["metrics"]["total_ms"] > 0
    assert {"fft_spectrum", "notch_filter", "extract_defects"} <= set(body["timings_ms"])
    assert len(body["histograms"]["before"]) == 256
    urls = body["stage_urls"]
    assert {"upload", "original", "spectrum", "residual", "mask_clean", "overlay"} <= set(urls)
    for url in urls.values():
        img = client.get(url)
        assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    assert client.get(urls["overlay"]).content[:4] == b"\x89PNG"


def test_inspect_clean_image_passes(client: TestClient, clean: np.ndarray) -> None:
    body = inspect(client, clean).json()
    assert body["decision"] == "PASS" and body["defects"] == [] and body["metrics"]["defect_count"] == 0


def test_inspect_accepts_jpeg_and_method_override(client: TestClient, defective: np.ndarray) -> None:
    res = client.post(
        "/inspect",
        files={"image": ("x.jpg", png(defective, ".jpg"), "image/jpeg")},
        data={"method": "local_statistics", "config": SMALL},
    )
    assert res.status_code == 201 and res.json()["method"] == "local_statistics"


def test_config_overrides_change_the_verdict(client: TestClient, defective: np.ndarray) -> None:
    lenient = json.dumps({"max_side": 256, "max_defects": 10, "max_area_percent": 50})
    body = inspect(client, defective, config=lenient).json()
    assert body["decision"] == "PASS" and body["defects"] and body["config"]["max_defects"] == 10


@pytest.mark.parametrize(
    ("upload", "form", "status", "needle"),
    [
        (b"this is not an image", {}, 422, "not a readable image"),
        (b"", {}, 422, "is empty"),
        (None, {"config": "{not json"}, 422, "not valid JSON"),
        (None, {"config": "[1, 2]"}, 422, "must be a JSON object"),
        (None, {"config": '{"max_side": 4}'}, 422, "max_side"),
        (None, {"config": '{"threshold": {"min_threshold": -5}}'}, 422, "threshold.min_threshold"),
        (None, {"method": "magic"}, 422, "method"),
        (None, {"profile_id": "999"}, 404, "no profile with id 999"),
        (None, {"method": "golden_template"}, 422, "needs a reference image"),
    ],
)
def test_inspect_rejects_bad_input_with_clear_messages(
    client: TestClient, clean: np.ndarray, upload: bytes | None, form: dict[str, str], status: int, needle: str
) -> None:
    data = upload if upload is not None else png(clean)
    res = client.post("/inspect", files={"image": ("f.png", data, "image/png")}, data={"config": SMALL, **form})
    assert res.status_code == status, res.text
    assert needle in json.dumps(res.json()["detail"])
    assert client.get("/inspections").json()["total"] == 0  # nothing stored for rejected requests


def test_inspect_requires_an_image(client: TestClient) -> None:
    assert client.post("/inspect", data={}).status_code == 422


def test_golden_template_with_reference(client: TestClient, defective: np.ndarray) -> None:
    res = client.post(
        "/inspect",
        files={"image": ("t.png", png(defective), "image/png"), "reference": ("r.png", png(make_texture(seed=9)), "image/png")},
        data={"method": "golden_template", "config": SMALL},
    )
    assert res.status_code == 201 and res.json()["decision"] == "FAIL"
    assert "aligned_reference" in res.json()["stage_urls"]


def test_inspect_with_profile(client: TestClient, defective: np.ndarray) -> None:
    profile = autotune(client).json()
    body = inspect(client, defective, profile_id=profile["id"], config="{}").json()
    assert body["profile_id"] == profile["id"]
    assert body["config"]["threshold"]["min_threshold"] == profile["config"]["threshold"]["min_threshold"]
    assert body["config"]["max_side"] == 256  # profile was tuned at 256 px


# --- /inspections ------------------------------------------------------------------------------
def test_list_filter_paginate(client: TestClient, clean: np.ndarray, defective: np.ndarray) -> None:
    profile_id = autotune(client).json()["id"]
    ids = [
        inspect(client, defective, "bad.png").json()["id"],
        inspect(client, clean, "ok1.png").json()["id"],
        inspect(client, clean, "ok2.png", profile_id=profile_id, config="{}").json()["id"],
    ]
    everything = client.get("/inspections").json()
    assert everything["total"] == 3 and [i["id"] for i in everything["items"]] == ids[::-1]  # newest first
    assert everything["items"][0]["thumbnail_url"] == f"/files/{ids[2]}/overlay.png"

    assert client.get("/inspections", params={"decision": "FAIL"}).json()["total"] == 1
    assert client.get("/inspections", params={"decision": "PASS"}).json()["total"] == 2
    assert [i["id"] for i in client.get("/inspections", params={"profile_id": profile_id}).json()["items"]] == [ids[2]]

    page = client.get("/inspections", params={"limit": 2, "offset": 1}).json()
    assert page["total"] == 3 and page["limit"] == 2 and [i["id"] for i in page["items"]] == [ids[1], ids[0]]
    assert client.get("/inspections", params={"offset": 5}).json()["items"] == []

    today = datetime.now(UTC).date()  # inspections are stored in UTC, so "today" must be the UTC date
    yesterday = today - timedelta(days=1)
    assert client.get("/inspections", params={"date_from": str(today - timedelta(days=1))}).json()["total"] == 3
    assert client.get("/inspections", params={"date_from": str(today + timedelta(days=1))}).json()["total"] == 0
    assert client.get("/inspections", params={"date_to": str(yesterday - timedelta(days=1))}).json()["total"] == 0
    both = {"date_from": str(today), "date_to": str(today + timedelta(days=1)), "decision": "FAIL"}
    assert client.get("/inspections", params=both).json()["total"] == 1


@pytest.mark.parametrize("params", [{"decision": "MAYBE"}, {"limit": 0}, {"limit": 1000}, {"offset": -1}, {"date_from": "yesterday"}])
def test_list_validates_query_params(client: TestClient, params: dict[str, Any]) -> None:
    assert client.get("/inspections", params=params).status_code == 422


def test_get_and_delete_inspection(client: TestClient, defective: np.ndarray, tmp_path: Path) -> None:
    created = inspect(client, defective).json()
    fetched = client.get(f"/inspections/{created['id']}").json()
    assert fetched == created
    folder = tmp_path / "files" / str(created["id"])
    assert (folder / "overlay.png").is_file()

    assert client.delete(f"/inspections/{created['id']}").status_code == 204
    assert not folder.exists()
    assert client.get(f"/inspections/{created['id']}").status_code == 404
    assert client.get(created["stage_urls"]["overlay"]).status_code == 404
    assert client.delete(f"/inspections/{created['id']}").status_code == 404
    assert client.get("/inspections").json()["total"] == 0


def test_unknown_inspection_is_404_with_message(client: TestClient) -> None:
    res = client.get("/inspections/12345")
    assert res.status_code == 404 and "12345" in res.json()["detail"]


@pytest.mark.parametrize("name", ["secret.txt", "..%2Ftest.db", "OVERLAY.png", "overlay.png.exe", "nope.png"])
def test_files_route_serves_only_stage_pngs(client: TestClient, clean: np.ndarray, name: str) -> None:
    created = inspect(client, clean).json()
    assert client.get(f"/files/{created['id']}/{name}").status_code == 404


# --- batch + websocket ---------------------------------------------------------------------------
def collect_events(client: TestClient, batch_id: str) -> list[dict[str, Any]]:
    events = []
    with client.websocket_connect(f"/ws/batch/{batch_id}") as ws:
        while True:
            event = ws.receive_json()
            events.append(event)
            if event["type"] in ("complete", "error"):
                return events


def test_batch_reports_progress_over_websocket(client: TestClient, clean: np.ndarray, defective: np.ndarray) -> None:
    files = [
        ("images", ("ok.png", png(clean), "image/png")),
        ("images", ("broken.png", b"garbage", "image/png")),
        ("images", ("bad.png", png(defective), "image/png")),
    ]
    res = client.post("/inspect/batch", files=files, data={"config": SMALL})
    assert res.status_code == 202
    accepted = res.json()
    assert accepted["total"] == 2 and accepted["ws_url"] == f"/ws/batch/{accepted['batch_id']}"
    assert [r["filename"] for r in accepted["rejected"]] == ["broken.png"]
    assert "not a readable image" in accepted["rejected"][0]["reason"]

    events = collect_events(client, accepted["batch_id"])
    progress = [e for e in events if e["type"] == "progress"]
    assert [e["done"] for e in progress] == [1, 2] and {e["filename"] for e in progress} == {"ok.png", "bad.png"}
    assert {e["decision"] for e in progress} == {"PASS", "FAIL"}
    assert events[-1] == {"type": "complete", "total": 2, "done": 2, "passed": 1, "failed": 1, "errors": 0}

    status = client.get(f"/inspect/batch/{accepted['batch_id']}").json()
    assert status["status"] == "complete" and status["done"] == 2 and len(status["inspection_ids"]) == 2
    stored = client.get(f"/inspections/{status['inspection_ids'][0]}").json()
    assert stored["batch_id"] == accepted["batch_id"]
    assert collect_events(client, accepted["batch_id"]) == events  # a late joiner gets the whole history


def test_batch_rejects_when_no_file_is_readable(client: TestClient) -> None:
    res = client.post("/inspect/batch", files=[("images", ("a.txt", b"x", "text/plain"))], data={"config": SMALL})
    assert res.status_code == 422 and "none of the files could be read" in res.json()["detail"]


def test_batch_unknown_id(client: TestClient) -> None:
    assert client.get("/inspect/batch/nope").status_code == 404
    with client.websocket_connect("/ws/batch/nope") as ws:
        assert ws.receive_json() == {"type": "error", "message": "no batch nope"}


# --- profiles ------------------------------------------------------------------------------------
def test_autotune_creates_lists_updates_and_deletes_profiles(client: TestClient, clean: np.ndarray) -> None:
    res = autotune(client, "Denim")
    assert res.status_code == 201
    profile = res.json()
    assert profile["name"] == "Denim" and profile["method"] == "fft" and profile["report"]["n_images"] == 6
    assert profile["report"]["min_area"] == profile["config"]["morphology"]["min_area"]

    assert [p["name"] for p in client.get("/profiles").json()] == ["Denim"]
    assert client.get(f"/profiles/{profile['id']}").json() == profile
    again = autotune(client, "Denim", n=7).json()
    assert again["id"] == profile["id"] and again["report"]["n_images"] == 7  # same name replaces
    other = autotune(client, "Ceramic tile", method="local_statistics").json()
    assert [p["name"] for p in client.get("/profiles").json()] == ["Ceramic tile", "Denim"]
    assert other["method"] == "local_statistics" and other["report"]["threshold_param"] == "local_stats.k"

    used = inspect(client, clean, profile_id=profile["id"], config="{}").json()["id"]
    assert client.delete(f"/profiles/{profile['id']}").status_code == 204
    assert client.get(f"/profiles/{profile['id']}").status_code == 404
    assert client.get(f"/inspections/{used}").json()["profile_id"] is None  # history is kept
    assert client.delete(f"/profiles/{profile['id']}").status_code == 404


@pytest.mark.parametrize(
    ("n", "form", "needle"),
    [
        (4, {}, "5-20"),
        (21, {}, "5-20"),
        (6, {"method": "golden_template"}, "reference"),
        (6, {"name": ""}, "name"),
        (6, {"quantile": "30"}, "quantile"),
    ],
)
def test_autotune_validation(client: TestClient, n: int, form: dict[str, str], needle: str) -> None:
    res = autotune(client, n=n, **form)
    assert res.status_code == 422 and needle in json.dumps(res.json()["detail"])
    assert client.get("/profiles").json() == []


def test_autotune_with_unreadable_image(client: TestClient) -> None:
    files = [("images", (f"g{i}.png", b"nope", "image/png")) for i in range(5)]
    res = client.post("/profiles/autotune", files=files, data={"name": "X"})
    assert res.status_code == 422 and "g0.png" in res.json()["detail"]


# --- /spectrum, /spectrum/apply -------------------------------------------------------------------
RAW = json.dumps({"max_side": 256, "enhance": {"method": "none"}, "denoise": {"method": "none"}})


def test_spectrum_returns_image_and_peaks(client: TestClient, clean: np.ndarray) -> None:
    res = client.post("/spectrum", files={"image": ("a.png", png(clean), "image/png")}, data={"config": RAW})
    assert res.status_code == 200
    body = res.json()
    assert (body["width"], body["height"]) == (256, 256)
    spectrum = decode_uri(body["spectrum"])
    assert spectrum.shape == (256, 256) and spectrum.max() == 255
    assert decode_uri(body["spectrum_peaks"]).shape == (256, 256, 3)
    peaks = {(p["row"], p["col"]) for p in body["peaks"]}
    assert {(128, 112), (128, 144)} <= peaks
    assert all(p["x"] == p["col"] and p["y"] == p["row"] for p in body["peaks"])


def draw_mask(points: list[tuple[int, int]], size: int = 256) -> bytes:
    mask = np.zeros((size, size), np.uint8)
    for x, y in points:
        cv2.circle(mask, (x, y), 5, 255, -1)
    return png(mask)


def apply(client: TestClient, image: np.ndarray, mask: bytes, **form: Any) -> Any:
    files = {"image": ("a.png", png(image), "image/png"), "mask": ("m.png", mask, "image/png")}
    return client.post("/spectrum/apply", files=files, data={"config": RAW, **form})


def test_spectrum_apply_removes_drawn_peak_and_finds_defect(client: TestClient, clean: np.ndarray, defective: np.ndarray) -> None:
    mask = draw_mask([(144, 128)])  # only ONE side drawn: the mirror is added server-side
    ok = apply(client, clean, mask)
    assert ok.status_code == 200
    assert ok.json()["decision"] == "PASS" and ok.json()["defects"] == []
    assert decode_uri(ok.json()["residual"]).std() < 80

    bad = apply(client, defective, mask).json()
    assert bad["decision"] == "FAIL" and bad["defect_area_percent"] > 0
    cy, cx = BLOB[0], BLOB[1]
    assert any(abs(d["centroid"][0] - cx) < 20 and abs(d["centroid"][1] - cy) < 20 for d in bad["defects"])
    assert decode_uri(bad["mask"]).shape == (256, 256) and decode_uri(bad["overlay"]).shape == (256, 256, 3)


def test_spectrum_apply_without_notch_leaves_the_texture(client: TestClient, clean: np.ndarray) -> None:
    res = apply(client, clean, png(np.zeros((256, 256), np.uint8))).json()
    assert res["decision"] == "FAIL"  # the unfiltered periodic texture is not 'defect free'


def test_spectrum_apply_resizes_mask_and_rejects_garbage(client: TestClient, clean: np.ndarray) -> None:
    assert apply(client, clean, draw_mask([(72, 64)], 128)).status_code == 200  # 128 px mask -> 256 px spectrum
    res = apply(client, clean, b"not a png")
    assert res.status_code == 422 and "'m.png'" in res.json()["detail"]


# --- /arena --------------------------------------------------------------------------------------
def test_arena_compares_methods_with_ground_truth(client: TestClient, defective: np.ndarray) -> None:
    gt = np.zeros((256, 256), np.uint8)
    cv2.circle(gt, (BLOB[1], BLOB[0]), BLOB[2], 255, -1)
    files = {
        "image": ("a.png", png(defective), "image/png"),
        "ground_truth": ("gt.png", png(gt), "image/png"),
        "reference": ("r.png", png(make_texture(seed=9)), "image/png"),
    }
    res = client.post("/arena", files=files, data={"methods": "fft,golden_template", "config": SMALL})
    assert res.status_code == 200
    body = res.json()
    assert body["ground_truth_provided"] and body["ground_truth_defective"] is True
    by_method = {r["method"]: r for r in body["results"]}
    assert list(by_method) == ["fft", "golden_template"]
    for r in by_method.values():
        assert r["status"] == "ok" and r["decision"] == "FAIL" and r["correct"] is True
        assert r["iou"] > 0.3 and 0 < r["dice"] <= 1 and r["total_ms"] > 0
        assert decode_uri(r["overlay"]).shape == (256, 256, 3) and decode_uri(r["mask"]).shape == (256, 256)


def test_arena_without_ground_truth_or_reference(client: TestClient, clean: np.ndarray) -> None:
    res = client.post(
        "/arena", files={"image": ("a.png", png(clean), "image/png")}, data={"methods": "fft,golden_template", "config": SMALL}
    )
    body = res.json()
    assert body["ground_truth_provided"] is False and body["ground_truth_defective"] is None
    fft, template = body["results"]
    assert fft["status"] == "ok" and fft["decision"] == "PASS" and fft["iou"] is None and fft["correct"] is None
    assert template["status"] == "skipped" and "reference" in template["message"] and template["decision"] is None


def test_arena_good_image_with_empty_mask_is_correct_when_it_passes(client: TestClient, clean: np.ndarray) -> None:
    files = {"image": ("a.png", png(clean), "image/png"), "ground_truth": ("g.png", png(np.zeros((256, 256), np.uint8)), "image/png")}
    r = client.post("/arena", files=files, data={"methods": "fft", "config": SMALL}).json()["results"][0]
    assert r["correct"] is True and r["iou"] == 1.0  # nothing predicted, nothing to find


def test_arena_defaults_to_all_methods_and_validates(client: TestClient, clean: np.ndarray) -> None:
    files = {"image": ("a.png", png(clean), "image/png")}
    res = client.post("/arena", files=files, data={"methods": "fft,wizardry"})
    assert res.status_code == 422 and "wizardry" in res.json()["detail"]


# --- /robustness ---------------------------------------------------------------------------------
def robustness(client: TestClient, image: np.ndarray, **form: Any) -> Any:
    return client.post("/robustness", files={"image": ("a.png", png(image), "image/png")}, data={"config": SMALL, **form})


def test_robustness_sweeps_each_degradation(client: TestClient, defective: np.ndarray) -> None:
    levels = json.dumps({"gaussian_noise": [0, 15], "jpeg_quality": [90, 20, 5]})
    res = robustness(client, defective, degradations="gaussian_noise,jpeg_quality", levels=levels)
    assert res.status_code == 200
    body = res.json()
    assert body["method"] == "fft" and set(body["series"]) == {"gaussian_noise", "jpeg_quality"}
    noise = body["series"]["gaussian_noise"]
    assert [p["level"] for p in noise] == [0, 15] and noise[0]["decision"] == "FAIL" and noise[0]["defect_area_percent"] > 0
    assert [p["level"] for p in body["series"]["jpeg_quality"]] == [90, 20, 5]
    assert all({"level", "decision", "defect_count", "defect_area_percent"} <= set(p) for s in body["series"].values() for p in s)
    assert "sigma" in body["parameters"]["gaussian_noise"]


def test_robustness_default_levels_cover_all_four_degradations(client: TestClient, defective: np.ndarray) -> None:
    levels = json.dumps({k: [0] for k in ("gaussian_noise", "blur", "brightness")} | {"jpeg_quality": [90]})
    body = robustness(client, defective, levels=levels).json()
    assert set(body["series"]) == {"gaussian_noise", "blur", "brightness", "jpeg_quality"}


@pytest.mark.parametrize(
    ("form", "needle"),
    [
        ({"degradations": "fog"}, "fog"),
        ({"levels": "oops"}, "not valid JSON"),
        ({"degradations": "blur", "levels": '{"blur": []}'}, "non-empty list"),
        ({"degradations": "blur", "levels": '{"blur": ["a"]}'}, "list of numbers"),
        ({"degradations": "blur", "levels": '{"blur": [-1]}'}, ">= 0"),
        ({"degradations": "jpeg_quality", "levels": '{"jpeg_quality": [0]}'}, "between 1 and 100"),
        ({"degradations": "blur", "levels": json.dumps({"blur": list(range(13))})}, "at most 12"),
        ({"levels": json.dumps({k: list(range(1, 12)) for k in ("blur", "gaussian_noise", "brightness", "jpeg_quality")})}, "too many"),
    ],
)
def test_robustness_validation(client: TestClient, clean: np.ndarray, form: dict[str, str], needle: str) -> None:
    res = robustness(client, clean, **form)
    assert res.status_code == 422 and needle in res.json()["detail"]


# --- /stats --------------------------------------------------------------------------------------
def test_stats_empty_then_populated(client: TestClient, clean: np.ndarray, defective: np.ndarray) -> None:
    empty = client.get("/stats").json()
    assert (empty["total"], empty["pass_rate"], empty["defects_by_type"]) == (0, None, {})
    assert len(empty["inspections_per_day"]) == 30 and all(d["total"] == 0 for d in empty["inspections_per_day"])

    inspect(client, defective)
    inspect(client, clean)
    inspect(client, clean)
    stats = client.get("/stats", params={"days": 7}).json()
    assert (stats["total"], stats["passed"], stats["failed"]) == (3, 2, 1)
    assert stats["pass_rate"] == pytest.approx(2 / 3)
    assert stats["defects_by_type"] == {"hole": 1}
    assert len(stats["inspections_per_day"]) == 7 and stats["inspections_per_day"][-1]["total"] == 3  # today, UTC
    assert sum(d["total"] for d in stats["inspections_per_day"]) == 3
    assert client.get("/stats", params={"days": 0}).status_code == 422


# --- CORS ----------------------------------------------------------------------------------------
def test_cors_allows_vite_dev_server_only(client: TestClient) -> None:
    headers = {"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"}
    allowed = client.options("/inspect", headers=headers)
    assert allowed.status_code == 200 and allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    other = client.options("/inspect", headers={**headers, "Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in other.headers
    assert client.get("/health", headers={"Origin": "http://localhost:5173"}).headers["access-control-allow-origin"]


# --- /ws/live ------------------------------------------------------------------------------------
def jpeg(image: np.ndarray) -> bytes:
    return png(image, ".jpg")


def test_live_returns_decision_and_overlay_per_frame(client: TestClient, defective: np.ndarray) -> None:
    with client.websocket_connect("/ws/live") as ws:
        ws.send_bytes(jpeg(defective))
        result = ws.receive_json()
    assert result["type"] == "result" and result["decision"] in ("PASS", "FAIL")
    assert result["defect_count"] == len(result["defects"]) and result["process_ms"] > 0
    assert decode_uri(result["overlay"]).shape[:2] == (320, 320)  # default live resolution
    assert (result["width"], result["height"]) == (320, 320)  # boxes are reported in these pixels


def test_live_survives_bad_frames_and_respects_5_fps(client: TestClient, clean: np.ndarray) -> None:
    with client.websocket_connect("/ws/live", params={"max_side": 128}) as ws:
        ws.send_bytes(b"not a jpeg")
        assert ws.receive_json()["type"] == "error"
        ws.send_bytes(jpeg(clean))
        first = ws.receive_json()
        assert first["type"] == "result" and decode_uri(first["overlay"]).shape[:2] == (128, 128)
        started = time.monotonic()
        ws.send_bytes(jpeg(clean))
        assert ws.receive_json()["type"] == "result"
        assert time.monotonic() - started >= 0.12  # the 200 ms spacing counts from the previous frame's start


def test_live_processes_only_the_newest_of_a_burst(client: TestClient, clean: np.ndarray) -> None:
    with client.websocket_connect("/ws/live", params={"max_side": 128}) as ws:
        for _ in range(8):
            ws.send_bytes(jpeg(clean))
        ws.receive_json()
        ws.send_text("ignored text frames do not break the stream")
        ws.send_bytes(jpeg(clean))
        assert ws.receive_json()["type"] == "result"


def test_live_rejects_unusable_settings(client: TestClient) -> None:
    for params, needle in (({"method": "golden_template"}, "reference"), ({"profile_id": 99}, "no profile"), ({"method": "magic"}, "method")):
        with client.websocket_connect("/ws/live", params=params) as ws:
            message = ws.receive_json()
        assert message["type"] == "error" and needle in message["message"]


def test_live_reports_the_working_size_of_a_non_square_frame(client: TestClient) -> None:
    frame = np.dstack([make_texture("sinusoid", 256)[:, :192]] * 3)  # 192 wide, 256 high
    with client.websocket_connect("/ws/live", params={"max_side": 128}) as ws:
        ws.send_bytes(jpeg(frame))
        result = ws.receive_json()
    assert (result["width"], result["height"]) == (96, 128)  # longest side scaled to max_side, aspect kept
    assert decode_uri(result["overlay"]).shape[:2] == (128, 96)


def test_bit_planes_endpoint(client: TestClient, defective: np.ndarray) -> None:
    created = inspect(client, defective).json()
    out = client.get(f"/inspections/{created['id']}/bit-planes").json()
    assert [p["bit"] for p in out["planes"]] == [7, 6, 5, 4, 3, 2, 1, 0]
    assert out["planes"][0]["label"] == "Bit 7 (MSB)" and out["planes"][-1]["label"] == "Bit 0 (LSB)"
    gray = cv2.imdecode(np.frombuffer(client.get(f"/files/{created['id']}/gray.png").content, np.uint8), cv2.IMREAD_GRAYSCALE)
    assert (out["width"], out["height"]) == (gray.shape[1], gray.shape[0])
    rebuilt = sum((decode_uri(p["image"]) > 0).astype(np.uint16) << p["bit"] for p in out["planes"])
    assert np.array_equal(rebuilt, gray)  # the planes add back up to the stored grayscale image
    msb = decode_uri(out["planes"][0]["image"])
    assert abs(out["planes"][0]["ones_percent"] - (msb > 0).mean() * 100) < 1e-6


def test_bit_planes_404s(client: TestClient) -> None:
    assert client.get("/inspections/999/bit-planes").status_code == 404


def test_live_trims_black_bars_and_reports_where_the_picture_is(client: TestClient, clean: np.ndarray) -> None:
    from texscan.api.routers.live import _live_config, process_frame

    framed = np.hstack([np.zeros((clean.shape[0], 100, 3), np.uint8), np.dstack([clean[:, :200]] * 3), np.zeros((clean.shape[0], 100, 3), np.uint8)])
    cfg = _live_config("fft", None, 256)
    assert cfg.trim_borders
    out = process_frame(png(framed), cfg)
    assert out["type"] == "result" and out["decision"] == "PASS"
    x, y, w, h = out["region"]
    assert (x, y, w, h) == (0.25, 0.0, 0.5, 1.0)
    plain = process_frame(png(np.dstack([clean] * 3)), cfg)
    assert plain["region"] == [0.0, 0.0, 1.0, 1.0]


def test_live_config_takes_the_centre_option_and_always_trims() -> None:
    from texscan.api.routers.live import _live_config

    cfg = _live_config("gabor", None, None, 0.6)
    assert cfg.center_fraction == 0.6 and cfg.trim_borders and cfg.max_side == 320
    assert _live_config("gabor", None, 480).center_fraction == 1.0
