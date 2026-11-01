"""Real-world size: the calibration marker, the ruler, the geometry across resolutions, and defect sizes in mm and inches.

The synthetic scene is plain noisy cloth with an optional ArUco marker (a known printed side) and a dark line defect of a
known length, so the true size of every measurement is known by construction.
"""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from texscan import db
from texscan.main import app
from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.measure import (
    MM_PER_INCH,
    detect_markers,
    marker_side_px,
    min_area_rect_size,
    mm_per_working_pixel,
    scale_from_marker,
    scale_from_points,
    with_physical_size,
)
from texscan.pipeline.types import Calibration, Defect
from texscan.report.marker import CELLS, cell_mm, marker_cells, marker_pdf

DICTIONARY = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
MARKER_MM = 50.0
MARKER_PX = 100  # so the truth is 0.5 mm per pixel
LINE = (100, 300, 400, 3)  # x, y, length px, thickness px: a 400 px = 200 mm line
TRUE_MM_PER_PX = MARKER_MM / MARKER_PX
TOLERANCE = 0.03  # the spec: measured length within 3%


def scene(width: int = 640, height: int = 480, marker: int = 0, line: tuple[int, int, int, int] | None = None, seed: int = 0) -> np.ndarray:
    """Noisy gray cloth; the marker (with its white quiet zone) top-left, the dark line defect wherever `line` says."""
    img = np.clip(150 + np.random.default_rng(seed).normal(0, 3, (height, width)), 0, 255).astype(np.uint8)
    if marker:
        quiet = marker // 6
        img[20 : 20 + marker + 2 * quiet, 20 : 20 + marker + 2 * quiet] = 235
        img[20 + quiet : 20 + quiet + marker, 20 + quiet : 20 + quiet + marker] = cv2.aruco.generateImageMarker(DICTIONARY, 0, marker)
    if line:
        x, y, length, thickness = line
        img[y : y + thickness, x : x + length] = 40
    return img


def calibration_from(image: np.ndarray) -> Calibration:
    markers = detect_markers(image)
    assert markers, "the synthetic marker was not found"
    return Calibration(mm_per_pixel=scale_from_marker(markers[0][1], MARKER_MM), image_long_side=max(image.shape[:2]), source="marker", reference_mm=MARKER_MM)


def longest(defects: list[Defect]) -> Defect:
    return max(defects, key=lambda d: d.length_px or 0)


def within(measured: float | None, truth: float, tolerance: float = TOLERANCE) -> bool:
    return measured is not None and abs(measured - truth) <= tolerance * truth


# ---------- pure functions ----------


def test_marker_side_and_scale_are_found_within_one_percent() -> None:
    markers = detect_markers(scene(marker=MARKER_PX))
    assert [m[0] for m in markers] == [0]
    assert within(marker_side_px(markers[0][1]), MARKER_PX, 0.01)
    assert within(scale_from_marker(markers[0][1], MARKER_MM), TRUE_MM_PER_PX, 0.01)


def test_marker_is_found_when_rotated_and_blurred() -> None:
    img = scene(marker=120)
    rotated = cv2.warpAffine(img, cv2.getRotationMatrix2D((210, 160), 25, 1.0), (640, 480), borderValue=150)
    blurred = cv2.GaussianBlur(rotated, (0, 0), 1.0)
    (_, corners), *_ = detect_markers(blurred)
    assert within(marker_side_px(corners), 120, 0.02)


def test_no_marker_in_plain_cloth() -> None:
    assert detect_markers(scene()) == []


def test_scale_from_points() -> None:
    assert scale_from_points((0, 0), (300, 400), 250.0) == pytest.approx(0.5)  # 500 px for 250 mm
    with pytest.raises(ValueError):
        scale_from_points((10, 10), (10, 10), 50.0)
    with pytest.raises(ValueError):
        scale_from_points((0, 0), (10, 0), 0.0)


def test_min_area_rect_of_a_rotated_bar() -> None:
    mask = np.zeros((400, 400), np.uint8)
    box = cv2.boxPoints(((200, 200), (200, 6), 30)).astype(np.int32)
    cv2.fillPoly(mask, [box], 255)
    ys, xs = np.nonzero(mask)
    length, width = min_area_rect_size(np.column_stack([xs, ys]).astype(np.float32))
    assert within(length, 200, 0.02) and width < 10


def test_min_area_rect_of_a_single_pixel_and_nothing() -> None:
    assert min_area_rect_size(np.array([[5.0, 7.0]], np.float32)) == (1.0, 1.0)
    assert min_area_rect_size(np.empty((0, 2), np.float32)) == (0.0, 0.0)


def test_working_scale_follows_resizing_and_cropping() -> None:
    cal = Calibration(mm_per_pixel=0.5, image_long_side=640, source="marker", reference_mm=50)
    assert mm_per_working_pixel(cal, (480, 640), (480, 640), (480, 640)) == pytest.approx(0.5)  # same image
    assert mm_per_working_pixel(cal, (960, 1280), (960, 1280), (960, 1280)) == pytest.approx(0.25)  # twice the pixels
    assert mm_per_working_pixel(cal, (480, 640), (480, 640), (240, 320)) == pytest.approx(1.0)  # shrunk to half
    assert mm_per_working_pixel(cal, (480, 640), (288, 384), (288, 384)) == pytest.approx(0.5)  # a crop keeps the pixel size
    assert mm_per_working_pixel(cal, (480, 640), (288, 384), (576, 768)) == pytest.approx(0.25)  # a crop enlarged 2x


def test_with_physical_size_in_mm_and_inches() -> None:
    d = Defect(id=1, bbox=(0, 0, 10, 4), area=40, centroid=(5, 2), perimeter=28, aspect_ratio=2.5, solidity=1.0, orientation_deg=0, length_px=10, width_px=4)
    (m,) = with_physical_size([d], 0.5)
    assert (m.length_mm, m.width_mm, m.area_mm2) == (5.0, 2.0, 10.0)
    assert m.length_in == pytest.approx(5.0 / MM_PER_INCH)
    assert m.area_in2 == pytest.approx(10.0 / MM_PER_INCH**2)
    assert d.length_mm is None  # the input is not mutated


# ---------- the whole pipeline ----------


def measured(config: PipelineConfig, image: np.ndarray) -> Defect:
    result = run_pipeline(image, config)
    assert result.decision == "FAIL" and result.defects
    return longest(result.defects)


def test_known_line_is_measured_within_three_percent() -> None:
    calibration = calibration_from(scene(marker=MARKER_PX))
    defect = measured(PipelineConfig(method="fft", max_side=640, calibration=calibration), scene(line=LINE, seed=5))
    truth_mm = LINE[2] * TRUE_MM_PER_PX
    assert within(defect.length_mm, truth_mm)
    assert within(defect.length_in, truth_mm / MM_PER_INCH)
    assert defect.width_mm is not None and defect.width_mm < 0.1 * defect.length_mm
    assert defect.area_mm2 is not None and defect.area_mm2 > 0
    assert defect.length_px is not None and within(defect.length_px, LINE[2])  # pixels are reported alongside


def test_a_rotated_line_is_measured_within_three_percent() -> None:
    calibration = calibration_from(scene(marker=MARKER_PX))
    img = scene(seed=7)
    mask = np.zeros_like(img)
    cv2.fillPoly(mask, [cv2.boxPoints(((320, 300), (300, 3), 30)).astype(np.int32)], 255)
    img[mask > 0] = 40
    defect = measured(PipelineConfig(method="fft", max_side=640, calibration=calibration), img)
    assert within(defect.length_mm, 300 * TRUE_MM_PER_PX)


def test_the_same_scene_at_twice_the_resolution_measures_the_same() -> None:
    """Calibrated on the 640 px picture, inspected on a 1280 px picture of the same cloth and then resized by the pipeline."""
    calibration = calibration_from(scene(marker=MARKER_PX))
    big = cv2.resize(scene(line=LINE, seed=5), (1280, 960), interpolation=cv2.INTER_LINEAR)
    for max_side in (640, 1280):
        defect = measured(PipelineConfig(method="fft", max_side=max_side, calibration=calibration), big)
        assert within(defect.length_mm, LINE[2] * TRUE_MM_PER_PX), max_side


def test_a_centre_crop_does_not_change_the_measurement() -> None:
    calibration = calibration_from(scene(marker=MARKER_PX))
    config = PipelineConfig(method="fft", max_side=640, calibration=calibration, center_fraction=0.8)
    assert within(measured(config, scene(line=LINE, seed=5)).length_mm, LINE[2] * TRUE_MM_PER_PX)


def test_without_calibration_sizes_are_pixels_only() -> None:
    result = run_pipeline(scene(line=LINE, seed=5), PipelineConfig(method="fft", max_side=640))
    defect = longest(result.defects)
    assert defect.length_px is not None and defect.width_px is not None
    assert (defect.length_mm, defect.width_mm, defect.area_mm2, defect.length_in) == (None, None, None, None)


def test_loose_masks_overestimate_but_stay_close_on_a_plain_line() -> None:
    """Gabor and local-statistics masks have a halo, so their measured length runs long. Documented, not hidden."""
    calibration = calibration_from(scene(marker=MARKER_PX))
    for method in ("gabor", "local_statistics"):
        defect = measured(PipelineConfig(method=method, max_side=640, calibration=calibration), scene(line=LINE, seed=5))
        assert LINE[2] * TRUE_MM_PER_PX <= defect.length_mm <= 1.15 * LINE[2] * TRUE_MM_PER_PX, method  # type: ignore[operator]


# ---------- the printable marker ----------


def test_the_printed_grid_is_a_valid_marker_of_the_stated_size() -> None:
    cells = marker_cells()
    assert cells.shape == (CELLS, CELLS) and cells[0].all() and cells[-1].all() and cells[:, 0].all() and cells[:, -1].all()
    assert cell_mm(50) * CELLS == pytest.approx(50)
    # draw it as the PDF does (cell by cell, with a white quiet zone) and read it back
    px = 10
    img = np.full(((CELLS + 6) * px, (CELLS + 6) * px), 255, np.uint8)
    for r in range(CELLS):
        for c in range(CELLS):
            if cells[r, c]:
                img[(r + 3) * px : (r + 4) * px, (c + 3) * px : (c + 4) * px] = 0
    ((found, corners),) = detect_markers(img)
    assert found == 0 and within(marker_side_px(corners), CELLS * px, 0.02)


def test_marker_pdf_states_its_size() -> None:
    pdf = marker_pdf(62.5)
    assert pdf.startswith(b"%PDF") and b"62.5 mm" in pdf
    with pytest.raises(ValueError):
        marker_pdf(5)
    with pytest.raises(ValueError):
        marker_pdf(500)


# ---------- the API ----------


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("TEXSCAN_DATA_DIR", str(tmp_path / "files"))
    monkeypatch.setattr(db, "engine", db.make_engine(f"sqlite:///{tmp_path / 'test.db'}"))
    with TestClient(app) as c:
        yield c


def png(image: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", image)
    assert ok
    return buf.tobytes()


def make_profile(client: TestClient, name: str = "Plain cloth") -> dict[str, Any]:
    files = [("images", (f"g{i}.png", png(scene(seed=100 + i)), "image/png")) for i in range(5)]
    res = client.post("/profiles/autotune", files=files, data={"name": name, "method": "fft", "config": json.dumps({"max_side": 640})})
    assert res.status_code == 201, res.text
    return res.json()  # type: ignore[no-any-return]


def inspect_line(client: TestClient, profile_id: int) -> dict[str, Any]:
    res = client.post(
        "/inspect",
        files={"image": ("line.png", png(scene(line=LINE, seed=5)), "image/png")},
        data={"profile_id": str(profile_id), "config": json.dumps({"max_side": 640})},
    )
    assert res.status_code == 201, res.text
    return res.json()  # type: ignore[no-any-return]


def calibrate_marker(client: TestClient, profile_id: int, side_mm: float = MARKER_MM) -> Any:
    return client.post(
        f"/profiles/{profile_id}/calibration/marker",
        files={"image": ("marker.png", png(scene(marker=MARKER_PX)), "image/png")},
        data={"side_mm": str(side_mm)},
    )


def test_calibrating_a_profile_with_the_marker_gives_sizes_in_every_inspection(client: TestClient) -> None:
    profile = make_profile(client)
    assert profile["config"]["calibration"] is None
    res = calibrate_marker(client, profile["id"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert within(body["mm_per_pixel"], TRUE_MM_PER_PX, 0.01) and "Marker found" in body["detail"]
    assert body["profile"]["config"]["calibration"]["source"] == "marker"
    # stored: a fresh read of the profile still has it
    assert client.get(f"/profiles/{profile['id']}").json()["config"]["calibration"]["reference_mm"] == MARKER_MM

    out = inspect_line(client, profile["id"])
    assert out["config"]["calibration"] is not None
    defect = max(out["defects"], key=lambda d: d["length_px"])
    assert within(defect["length_mm"], LINE[2] * TRUE_MM_PER_PX)
    assert defect["length_in"] == pytest.approx(defect["length_mm"] / MM_PER_INCH)
    assert defect["length_px"] > 0 and defect["width_mm"] > 0 and defect["area_mm2"] > 0 and defect["area_in2"] > 0
    # the stored inspection keeps the sizes
    again = client.get(f"/inspections/{out['id']}").json()
    assert max(again["defects"], key=lambda d: d["length_px"])["length_mm"] == pytest.approx(defect["length_mm"])


def test_an_uncalibrated_profile_reports_pixels_only(client: TestClient) -> None:
    out = inspect_line(client, make_profile(client)["id"])
    assert out["config"]["calibration"] is None
    assert all(d["length_px"] and d["length_mm"] is None and d["area_mm2"] is None for d in out["defects"])


def test_ruler_calibration(client: TestClient) -> None:
    pid = make_profile(client)["id"]
    ok = client.post(f"/profiles/{pid}/calibration/ruler", data={"image_width": 640, "image_height": 480, "x1": 100, "y1": 50, "x2": 500, "y2": 50, "distance_mm": 200})
    assert ok.status_code == 200, ok.text
    cal = ok.json()["profile"]["config"]["calibration"]
    assert cal["mm_per_pixel"] == pytest.approx(0.5) and cal["image_long_side"] == 640 and cal["source"] == "ruler"
    defect = max(inspect_line(client, pid)["defects"], key=lambda d: d["length_px"])
    assert within(defect["length_mm"], LINE[2] * 0.5)

    base = {"image_width": 640, "image_height": 480, "distance_mm": 200}
    assert client.post(f"/profiles/{pid}/calibration/ruler", data={**base, "x1": 100, "y1": 50, "x2": 900, "y2": 50}).status_code == 422  # outside the photo
    assert client.post(f"/profiles/{pid}/calibration/ruler", data={**base, "x1": 100, "y1": 50, "x2": 101, "y2": 50}).status_code == 422  # too close
    assert client.post("/profiles/999/calibration/ruler", data={**base, "x1": 1, "y1": 1, "x2": 300, "y2": 1}).status_code == 404


def test_marker_calibration_errors(client: TestClient) -> None:
    pid = make_profile(client)["id"]
    plain = client.post(f"/profiles/{pid}/calibration/marker", files={"image": ("p.png", png(scene()), "image/png")}, data={"side_mm": "50"})
    assert plain.status_code == 422 and "No calibration marker" in plain.json()["detail"]
    assert calibrate_marker(client, pid, side_mm=0).status_code == 422
    assert calibrate_marker(client, 999).status_code == 404


def test_clearing_and_retuning(client: TestClient) -> None:
    profile = make_profile(client)
    assert calibrate_marker(client, profile["id"]).status_code == 200
    # tuning again under the same name keeps the calibration
    assert make_profile(client)["config"]["calibration"] is not None
    cleared = client.delete(f"/profiles/{profile['id']}/calibration")
    assert cleared.status_code == 200 and cleared.json()["config"]["calibration"] is None
    assert all(d["length_mm"] is None for d in inspect_line(client, profile["id"])["defects"])


def test_marker_pdf_endpoint(client: TestClient) -> None:
    res = client.get("/calibration/marker.pdf", params={"side_mm": 40})
    assert res.status_code == 200 and res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF") and b"40 mm" in res.content
    assert "texscan-marker-40mm.pdf" in res.headers["content-disposition"]
    assert client.get("/calibration/marker.pdf", params={"side_mm": 5}).status_code == 422
    assert client.get("/calibration/marker.pdf", params={"side_mm": 500}).status_code == 422
    assert client.get("/calibration/marker.pdf").status_code == 200  # default size


def test_inspection_report_pdf_is_made_with_and_without_calibration(client: TestClient) -> None:
    profile = make_profile(client)
    plain = inspect_line(client, profile["id"])
    assert calibrate_marker(client, profile["id"]).status_code == 200
    sized = inspect_line(client, profile["id"])
    for out in (plain, sized):
        res = client.get(f"/inspections/{out['id']}/report.pdf")
        assert res.status_code == 200 and res.content.startswith(b"%PDF")
