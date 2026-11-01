"""Roll Inspection: create a roll, place captures along it, score with the four-point system, report, stats.

The scene is plain cloth with a 400 px line. With the 0.5 mm per pixel calibration that line is 200 mm = 7.87 in long,
so it is a 3-point defect, and a 480 px tall picture covers 0.24 m of roll.
"""

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.test_measure import LINE, MARKER_PX, TRUE_MM_PER_PX, calibrate_marker, client, make_profile, png, scene  # noqa: F401
from texscan.grading import YARD_M, points_per_100_sq_yd

LINE_Y_M = (LINE[1] + 1.5) * TRUE_MM_PER_PX / 1000  # centre of the line, from the top edge of the picture
COVERED_M = 480 * TRUE_MM_PER_PX / 1000
WIDTH_MM = 1000.0
LINE_POINTS = 3


def calibrated_profile(client: TestClient) -> int:
    profile = make_profile(client)
    assert calibrate_marker(client, profile["id"]).status_code == 200
    return int(profile["id"])


def new_roll(client: TestClient, profile_id: int, code: str = "R-1", length_m: float = 2.0, **extra: Any) -> dict[str, Any]:
    body = {"code": code, "supplier": "Acme Mills", "fabric": "Cotton twill", "profile_id": profile_id, "width_mm": WIDTH_MM, "length_m": length_m, **extra}
    res = client.post("/rolls", json=body)
    assert res.status_code == 201, res.text
    return res.json()  # type: ignore[no-any-return]


def capture(client: TestClient, roll_id: int, positions: list[float], defective: list[bool] | None = None) -> Any:
    defective = defective or [True] * len(positions)
    files = [("images", (f"c{i}.png", png(scene(line=LINE if bad else None, seed=5 + i)), "image/png")) for i, bad in enumerate(defective)]
    return client.post(f"/rolls/{roll_id}/captures", files=files, data={"positions": json.dumps(positions)})


# ---------- creating a roll ----------


def test_a_new_roll_is_open_and_empty(client: TestClient) -> None:
    roll = new_roll(client, calibrated_profile(client))
    assert roll["status"] == "open" and roll["code"] == "R-1" and roll["limit"] == 40
    assert roll["width_in"] == pytest.approx(WIDTH_MM / 25.4) and roll["length_yd"] == pytest.approx(2.0 / YARD_M)
    s = roll["summary"]
    assert (s["total_points"], s["capture_count"], s["grade"], s["provisional"]) == (0, 0, "Not inspected", True)
    assert roll["profile_name"] == "Plain cloth" and roll["captures"] == [] and roll["defects"] == []


def test_a_roll_needs_a_calibrated_profile_and_a_new_id(client: TestClient) -> None:
    plain = make_profile(client)["id"]
    body = {"code": "R-1", "profile_id": plain, "width_mm": 1000, "length_m": 10}
    res = client.post("/rolls", json=body)
    assert res.status_code == 422 and "no size calibration" in res.json()["detail"]
    assert client.post("/rolls", json={**body, "profile_id": 999}).status_code == 404
    assert calibrate_marker(client, plain).status_code == 200
    assert client.post("/rolls", json=body).status_code == 201
    assert client.post("/rolls", json=body).status_code == 409  # the ID is taken
    assert client.post("/rolls", json={**body, "code": "R-2", "width_mm": 0}).status_code == 422
    assert client.post("/rolls", json={**body, "code": "  "}).status_code == 422


# ---------- captures and scoring ----------


def test_captures_are_placed_on_the_roll_and_scored(client: TestClient) -> None:
    pid = calibrated_profile(client)
    roll = new_roll(client, pid)
    res = capture(client, roll["id"], [0.5, 1.5], [True, False])
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["added"] == 1 + 1 and body["rejected"] == []
    out = body["roll"]
    (defect,) = out["defects"]
    assert defect["position_m"] == pytest.approx(0.5 + LINE_Y_M, abs=0.02)  # the metre mark + the line's distance from the top edge
    assert defect["length_in"] == pytest.approx(200 / 25.4, rel=0.03) and defect["points"] == LINE_POINTS
    assert defect["defect_type"] and defect["continuous"] is False
    s = out["summary"]
    assert s["total_points"] == LINE_POINTS and s["capture_count"] == 2 and s["defect_count"] == 1
    # an open roll is graded over the part inspected so far (to the end of the furthest capture)
    assert s["provisional"] and s["length_inspected_m"] == pytest.approx(1.5 + COVERED_M, abs=0.01)
    assert s["points_per_100_sq_yd"] == pytest.approx(points_per_100_sq_yd(3, s["length_inspected_yd"], out["width_in"]))
    assert [c["position_m"] for c in out["captures"]] == [0.5, 1.5] and out["captures"][0]["decision"] == "FAIL" and out["captures"][1]["decision"] == "PASS"
    assert out["captures"][0]["overlay_url"].endswith("/overlay.png")


def test_completing_the_roll_grades_it_over_its_full_length(client: TestClient) -> None:
    roll = new_roll(client, calibrated_profile(client), length_m=2.0)
    capture(client, roll["id"], [0.5])
    done = client.patch(f"/rolls/{roll['id']}", json={"status": "complete", "inspector": "A. Khan"}).json()
    s = done["summary"]
    assert done["status"] == "complete" and done["completed_at"] and done["inspector"] == "A. Khan" and not s["provisional"]
    assert s["length_inspected_m"] == 2.0
    expected = points_per_100_sq_yd(LINE_POINTS, 2.0 / YARD_M, WIDTH_MM / 25.4)  # 3 points on about 2.2 yd x 39 in
    assert s["points_per_100_sq_yd"] == pytest.approx(expected) and expected > 40
    assert not s["accepted"] and s["grade"] == "Off quality"
    # the limit is the buyer's: a looser one accepts the same roll
    loose = client.patch(f"/rolls/{roll['id']}", json={"limit": 200}).json()
    assert loose["summary"]["accepted"] and loose["summary"]["grade"] == "First quality"
    # a complete roll takes no more captures until it is opened again
    assert capture(client, roll["id"], [1.0]).status_code == 409
    assert client.patch(f"/rolls/{roll['id']}", json={"status": "open"}).json()["completed_at"] is None
    assert capture(client, roll["id"], [1.0]).status_code == 201


def test_a_yard_is_capped_at_four_points(client: TestClient) -> None:
    roll = new_roll(client, calibrated_profile(client), length_m=2.0)
    out = capture(client, roll["id"], [0.3, 0.6]).json()["roll"]  # two 3-point defects in yard 0 (0 to 0.914 m)
    assert [d["points"] for d in out["defects"]] == [LINE_POINTS, LINE_POINTS]
    s = out["summary"]
    assert (s["raw_points"], s["total_points"]) == (2 * LINE_POINTS, 4)
    assert s["yards"] == [{"yard": 0, "from_m": 0.0, "to_m": pytest.approx(YARD_M), "raw": 6, "points": 4}]


def test_overlaps_and_gaps_are_flagged(client: TestClient) -> None:
    roll = new_roll(client, calibrated_profile(client), length_m=3.0)
    warnings = capture(client, roll["id"], [0.5, 0.6, 2.0], [False] * 3).json()["roll"]["summary"]["warnings"]
    assert any("overlap" in w and "0.50 m" in w and "0.60 m" in w for w in warnings)
    assert any("Nothing was inspected between" in w for w in warnings)
    done = client.patch(f"/rolls/{roll['id']}", json={"status": "complete"}).json()["summary"]
    assert done["coverage_percent"] < 98 and any("Only" in w for w in done["warnings"])


def test_bad_positions_and_files_are_rejected(client: TestClient) -> None:
    roll = new_roll(client, calibrated_profile(client), length_m=2.0)
    rid = roll["id"]
    one = [("images", ("a.png", png(scene()), "image/png"))]
    assert client.post(f"/rolls/{rid}/captures", files=one, data={"positions": "[0, 1]"}).status_code == 422  # one mark too many
    assert client.post(f"/rolls/{rid}/captures", files=one, data={"positions": "[5]"}).status_code == 422  # beyond the roll
    assert client.post(f"/rolls/{rid}/captures", files=one, data={"positions": "[-1]"}).status_code == 422
    assert client.post(f"/rolls/{rid}/captures", files=one, data={"positions": "nope"}).status_code == 422
    assert client.post(f"/rolls/{rid}/captures", files=one, data={"positions": '["a"]'}).status_code == 422
    junk = [("images", ("bad.png", b"not an image", "image/png")), ("images", ("a.png", png(scene()), "image/png"))]
    res = client.post(f"/rolls/{rid}/captures", files=junk, data={"positions": "[0.1, 0.5]"})
    assert res.status_code == 201 and res.json()["added"] == 1 and res.json()["rejected"][0]["filename"] == "bad.png"
    only_junk = client.post(f"/rolls/{rid}/captures", files=[junk[0]], data={"positions": "[0.1]"})
    assert only_junk.status_code == 422
    assert capture(client, 999, [0.1]).status_code == 404


def test_removing_a_calibration_stops_new_captures(client: TestClient) -> None:
    pid = calibrated_profile(client)
    roll = new_roll(client, pid)
    client.delete(f"/profiles/{pid}/calibration")
    res = capture(client, roll["id"], [0.1])
    assert res.status_code == 422 and "no size calibration" in res.json()["detail"]


# ---------- removing things ----------


def test_deleting_a_capture_removes_its_inspection_and_rescored_the_roll(client: TestClient) -> None:
    roll = new_roll(client, calibrated_profile(client))
    out = capture(client, roll["id"], [0.5]).json()["roll"]
    cap = out["captures"][0]
    after = client.delete(f"/rolls/{roll['id']}/captures/{cap['id']}").json()
    assert after["captures"] == [] and after["defects"] == [] and after["summary"]["total_points"] == 0
    assert client.get(f"/inspections/{cap['inspection_id']}").status_code == 404
    assert client.delete(f"/rolls/{roll['id']}/captures/{cap['id']}").status_code == 404


def test_deleting_the_inspection_in_history_removes_the_capture(client: TestClient) -> None:
    roll = new_roll(client, calibrated_profile(client))
    cap = capture(client, roll["id"], [0.5]).json()["roll"]["captures"][0]
    assert client.delete(f"/inspections/{cap['inspection_id']}").status_code == 204
    again = client.get(f"/rolls/{roll['id']}").json()
    assert again["captures"] == [] and again["summary"]["total_points"] == 0


def test_deleting_a_roll_removes_its_captures(client: TestClient) -> None:
    roll = new_roll(client, calibrated_profile(client))
    cap = capture(client, roll["id"], [0.5]).json()["roll"]["captures"][0]
    assert client.delete(f"/rolls/{roll['id']}").status_code == 204
    assert client.get(f"/rolls/{roll['id']}").status_code == 404
    assert client.get(f"/inspections/{cap['inspection_id']}").status_code == 404


# ---------- list, report, stats ----------


def test_listing_and_filtering(client: TestClient) -> None:
    pid = calibrated_profile(client)
    a = new_roll(client, pid, "A-1", supplier="Acme Mills")
    b = new_roll(client, pid, "B-7", supplier="Bright Weavers")
    client.patch(f"/rolls/{b['id']}", json={"status": "complete"})
    everything = client.get("/rolls").json()
    assert [r["code"] for r in everything] == ["B-7", "A-1"]  # newest first
    assert {r["code"] for r in client.get("/rolls", params={"status": "open"}).json()} == {"A-1"}
    assert [r["code"] for r in client.get("/rolls", params={"q": "bright"}).json()] == ["B-7"]
    first = next(r for r in everything if r["code"] == "A-1")
    assert first["provisional"] and first["id"] == a["id"] and first["capture_count"] == 0


def test_roll_report_pdf(client: TestClient) -> None:
    roll = new_roll(client, calibrated_profile(client), code="PO 17/B", inspector="A. Khan")
    capture(client, roll["id"], [0.3, 0.6, 1.2], [True, True, False])
    res = client.get(f"/rolls/{roll['id']}/report.pdf")
    assert res.status_code == 200 and res.headers["content-type"] == "application/pdf" and res.content.startswith(b"%PDF")
    assert "texscan-roll-PO_17_B.pdf" in res.headers["content-disposition"]
    assert len(res.content) > 3000
    empty = new_roll(client, 1, code="EMPTY")
    assert client.get(f"/rolls/{empty['id']}/report.pdf").status_code == 200  # a roll without captures still has a record
    assert client.get("/rolls/999/report.pdf").status_code == 404


def test_roll_stats(client: TestClient) -> None:
    pid = calibrated_profile(client)
    empty = client.get("/rolls/stats").json()
    assert (empty["rolls_inspected"], empty["acceptance_rate"], empty["avg_points_per_100_sq_yd"], empty["suppliers"]) == (0, None, None, [])

    bad = new_roll(client, pid, "R-bad", length_m=2.0, supplier="Acme Mills")
    capture(client, bad["id"], [0.5])
    good = new_roll(client, pid, "R-good", length_m=100.0, supplier="Acme Mills")
    capture(client, good["id"], [0.5], [False])
    other = new_roll(client, pid, "R-other", length_m=100.0, supplier="Bright Weavers")
    capture(client, other["id"], [0.5, 40.0])
    new_roll(client, pid, "R-open")
    for r in (bad, good, other):
        client.patch(f"/rolls/{r['id']}", json={"status": "complete"})

    stats = client.get("/rolls/stats").json()
    assert (stats["rolls_inspected"], stats["rolls_open"], stats["accepted"], stats["rejected"]) == (3, 1, 2, 1)
    assert stats["acceptance_rate"] == pytest.approx(100 * 2 / 3)
    scores = [client.get(f"/rolls/{r['id']}").json()["summary"]["points_per_100_sq_yd"] for r in (bad, good, other)]
    assert stats["avg_points_per_100_sq_yd"] == pytest.approx(sum(scores) / 3)
    by_supplier = {s["supplier"]: s for s in stats["suppliers"]}
    assert by_supplier["Acme Mills"]["rolls"] == 2 and by_supplier["Acme Mills"]["accepted"] == 1 and by_supplier["Acme Mills"]["defects"] == 1
    assert by_supplier["Bright Weavers"]["defects"] == 2
    assert by_supplier["Bright Weavers"]["top_defect_types"][0]["count"] == 2
    assert stats["suppliers"][0]["supplier"] == "Acme Mills"  # most rolls first
