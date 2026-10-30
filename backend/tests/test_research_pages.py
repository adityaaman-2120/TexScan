"""Backend support for Method Arena and Robustness Lab."""

import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from tests.conftest import add_blob, make_texture
from tests.test_api import client, clean, decode_uri, defective, png  # noqa: F401  (shared fixtures)
from texscan.eval.metrics import dice, pixel_prf
from texscan.eval.report import write_results
from texscan.eval.synthetic import make_synthetic_mvtec
from texscan.robustness import jpeg_bytes, psnr, ssim_luma, sweep
from texscan.pipeline import PipelineConfig

SMALL = json.dumps({"max_side": 256})


# --- pixel precision / recall / F1 -------------------------------------------------------------------
def masks(pred: list[tuple[int, int]], gt: list[tuple[int, int]]) -> tuple[np.ndarray, np.ndarray]:
    p, g = np.zeros((10, 10), bool), np.zeros((10, 10), bool)
    for y, x in pred:
        p[y, x] = True
    for y, x in gt:
        g[y, x] = True
    return p, g


def test_pixel_prf_values() -> None:
    pred, gt = masks([(0, 0), (0, 1), (0, 2), (5, 5)], [(0, 0), (0, 1), (9, 9)])
    precision, recall, f1 = pixel_prf(pred, gt)
    assert precision == pytest.approx(2 / 4) and recall == pytest.approx(2 / 3)
    assert f1 == pytest.approx(2 * precision * recall / (precision + recall))


def test_pixel_f1_is_the_dice_coefficient() -> None:
    rng = np.random.default_rng(0)
    for _ in range(20):
        pred, gt = rng.random((20, 20)) > 0.6, rng.random((20, 20)) > 0.6
        assert pixel_prf(pred, gt)[2] == pytest.approx(dice(pred, gt))


def test_pixel_prf_edge_cases() -> None:
    empty = np.zeros((4, 4), bool)
    full = np.ones((4, 4), bool)
    assert pixel_prf(empty, empty) == (None, None, 1.0)  # nothing to find, nothing claimed: perfect
    assert pixel_prf(full, empty) == (0.0, None, 0.0)  # false alarm on a clean image
    assert pixel_prf(empty, full) == (None, 0.0, 0.0)  # missed everything
    assert pixel_prf(full, full) == (1.0, 1.0, 1.0)


# --- arena ----------------------------------------------------------------------------------------------
def test_arena_reports_precision_recall_and_f1_equal_to_dice(client: TestClient, defective: np.ndarray) -> None:
    gt = np.zeros((256, 256), np.uint8)
    cv2.circle(gt, (200, 60), 10, 255, -1)
    files = {"image": ("a.png", png(defective), "image/png"), "ground_truth": ("g.png", png(gt), "image/png")}
    res = client.post("/arena", files=files, data={"methods": "fft,local_statistics", "config": SMALL}).json()
    for r in res["results"]:
        assert 0 < r["precision"] <= 1 and 0 < r["recall"] <= 1
        assert r["f1"] == pytest.approx(r["dice"]) and r["f1"] == pytest.approx(2 * r["precision"] * r["recall"] / (r["precision"] + r["recall"]))


def test_arena_without_ground_truth_has_no_pixel_metrics(client: TestClient, clean: np.ndarray) -> None:
    res = client.post("/arena", files={"image": ("a.png", png(clean), "image/png")}, data={"methods": "fft", "config": SMALL}).json()
    r = res["results"][0]
    assert r["precision"] is None and r["recall"] is None and r["f1"] is None


# --- image quality ----------------------------------------------------------------------------------------
def test_psnr_and_ssim_behave() -> None:
    img = make_texture("grid")
    assert psnr(img, img) == 100.0 and ssim_luma(img, img) == pytest.approx(1.0)
    noisy = np.clip(img.astype(float) + np.random.default_rng(0).normal(0, 20, img.shape), 0, 255).astype(np.uint8)
    assert 15 < psnr(img, noisy) < 30  # sigma 20 is about 22 dB
    assert psnr(img, noisy) == pytest.approx(10 * np.log10(255**2 / np.mean((img.astype(float) - noisy) ** 2)))
    assert 0 < ssim_luma(img, noisy) < 0.95
    flat = np.full_like(img, 128)
    assert ssim_luma(img, flat) < ssim_luma(img, noisy)
    bgr = np.dstack([img, img, img])
    assert ssim_luma(bgr, bgr) == pytest.approx(1.0)


def test_jpeg_size_grows_with_quality() -> None:
    img = make_texture("grid", seed=3)
    sizes = [jpeg_bytes(img, q) for q in (10, 40, 70, 95)]
    assert sizes == sorted(sizes) and sizes[0] < sizes[-1] / 2


def test_jpeg_sweep_is_monotonic_in_quality() -> None:
    points = sweep(add_blob(make_texture("sinusoid")), PipelineConfig(max_side=256), "jpeg_quality", [10, 40, 90])
    assert [p["psnr"] for p in points] == sorted(p["psnr"] for p in points)
    assert [p["ssim"] for p in points] == sorted(p["ssim"] for p in points)
    assert [p["file_bytes"] for p in points] == sorted(p["file_bytes"] for p in points)
    assert all(p["image"].shape == (256, 256) for p in points)


def test_non_jpeg_sweeps_have_no_file_size() -> None:
    points = sweep(make_texture("sinusoid"), PipelineConfig(max_side=256), "blur", [0, 3])
    assert all(p["file_bytes"] is None for p in points)
    assert points[0]["psnr"] == 100.0 and points[1]["psnr"] < 100 and points[1]["ssim"] < points[0]["ssim"]


def test_robustness_api_returns_thumbnails_quality_and_sizes(client: TestClient, defective: np.ndarray) -> None:
    levels = json.dumps({"jpeg_quality": [20, 90], "gaussian_noise": [0, 20]})
    res = client.post(
        "/robustness", files={"image": ("a.png", png(defective), "image/png")},
        data={"config": SMALL, "degradations": "jpeg_quality,gaussian_noise", "levels": levels},
    ).json()
    assert res["raw_bytes"] == 256 * 256 * 3 and decode_uri(res["original_thumbnail"]).shape[0] == 128
    jpeg = res["series"]["jpeg_quality"]
    assert [p["level"] for p in jpeg] == [20, 90]
    assert jpeg[0]["file_bytes"] < jpeg[1]["file_bytes"] < res["raw_bytes"]
    assert jpeg[0]["psnr"] < jpeg[1]["psnr"] and jpeg[0]["ssim"] < jpeg[1]["ssim"]
    for p in jpeg + res["series"]["gaussian_noise"]:
        assert decode_uri(p["thumbnail"]).shape[:2] == (128, 128) and "image" not in p
    assert all(p["file_bytes"] is None for p in res["series"]["gaussian_noise"])


# --- MVTec dataset endpoints ----------------------------------------------------------------------------------
@pytest.fixture
def mvtec(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = make_synthetic_mvtec(tmp_path / "mvtec", ("carpet", "wood"), size=128, n_train=2, n_good=3, n_per_defect=2)
    monkeypatch.setenv("MVTEC_PATH", str(root))
    return root


def test_mvtec_status_unavailable_without_the_dataset(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MVTEC_PATH", raising=False)
    body = client.get("/datasets/mvtec").json()
    assert body["available"] is False and "MVTEC_PATH" in body["message"] and body["categories"] == []
    assert client.get("/datasets/mvtec/samples", params={"category": "carpet"}).status_code == 404


def test_mvtec_status_lists_categories(client: TestClient, mvtec: Path) -> None:
    body = client.get("/datasets/mvtec").json()
    assert body["available"] is True
    carpet = next(c for c in body["categories"] if c["name"] == "carpet")
    assert carpet["defect_types"] == {"blob": 2, "good": 3, "scratch": 2} and carpet["test_images"] == 7 and carpet["has_masks"]
    assert [c["name"] for c in body["categories"]] == ["carpet", "wood"]  # texture categories first


def test_mvtec_status_rejects_a_folder_that_is_not_the_dataset(client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "empty").mkdir()
    monkeypatch.setenv("MVTEC_PATH", str(tmp_path / "empty"))
    body = client.get("/datasets/mvtec").json()
    assert body["available"] is False and "no MVTec categories" in body["message"]


def test_mvtec_samples_files_masks_and_reference(client: TestClient, mvtec: Path) -> None:
    samples = client.get("/datasets/mvtec/samples", params={"category": "carpet", "limit": 3}).json()
    assert len(samples) == 3 and {s["defect_type"] for s in samples} == {"blob", "scratch"}  # round-robin, defective only
    assert all(s["has_mask"] for s in samples)
    first = samples[0]
    image = client.get(f"/datasets/mvtec/files/carpet/{first['defect_type']}/{first['name']}")
    assert image.status_code == 200 and cv2.imdecode(np.frombuffer(image.content, np.uint8), 0).shape == (128, 128)
    mask = client.get(f"/datasets/mvtec/masks/carpet/{first['defect_type']}/{first['name']}")
    assert mask.status_code == 200 and cv2.imdecode(np.frombuffer(mask.content, np.uint8), 0).max() == 255
    ref = client.get("/datasets/mvtec/reference/carpet")
    assert ref.status_code == 200 and ref.headers["content-type"].startswith("image/")

    good = client.get("/datasets/mvtec/samples", params={"category": "carpet", "defect_type": "good", "defective_only": "false"}).json()
    assert len(good) == 3 and not any(s["has_mask"] for s in good)
    assert len(client.get("/datasets/mvtec/samples", params={"category": "carpet", "defective_only": "false", "limit": 50}).json()) == 7


@pytest.mark.parametrize(
    "path",
    [
        "/datasets/mvtec/files/carpet/blob/..%2F..%2F..%2Fsecret.png",
        "/datasets/mvtec/files/..%2Fcarpet/blob/000.png",
        "/datasets/mvtec/files/carpet/..%2Ftrain/000.png",
        "/datasets/mvtec/masks/carpet/blob/..%2F..%2Fx",
        "/datasets/mvtec/files/carpet/blob/.hidden",
        "/datasets/mvtec/files/carpet/blob/a..b.png",
    ],
)
def test_mvtec_paths_cannot_escape_the_dataset(client: TestClient, mvtec: Path, path: str) -> None:
    assert client.get(path).status_code in (404, 422)


def test_mvtec_unknown_things_are_404(client: TestClient, mvtec: Path) -> None:
    assert client.get("/datasets/mvtec/samples", params={"category": "nope"}).status_code == 404
    assert client.get("/datasets/mvtec/files/carpet/blob/999.png").status_code == 404
    assert client.get("/datasets/mvtec/masks/carpet/good/000.png").status_code == 404  # good images have no mask
    assert client.get("/datasets/mvtec/reference/nope").status_code == 404
    assert client.get("/datasets/mvtec/samples", params={"category": "carpet", "limit": 0}).status_code == 422


# --- benchmark ---------------------------------------------------------------------------------------------------
RESULT: dict[str, dict[str, dict[str, Any]]] = {
    "fft": {"carpet": {"accuracy": 0.9, "precision": 0.8, "recall": 1.0, "f1": 0.89, "tp": 8, "fp": 2, "tn": 10, "fn": 0, "pixel_iou": 0.5, "pixel_dice": 0.6, "n_images": 20, "n_defective": 8, "errors": [], "seconds_per_image": 0.4}},
    "gabor": {"carpet": {"accuracy": 0.5, "precision": 0.5, "recall": 1.0, "f1": 0.67, "tp": 8, "fp": 8, "tn": 4, "fn": 0, "pixel_iou": None, "pixel_dice": None, "n_images": 20, "n_defective": 8, "errors": ["ValueError: x"], "seconds_per_image": 2.1}},
}  # fmt: skip


@pytest.fixture
def results_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("TEXSCAN_RESULTS_DIR", str(tmp_path / "results"))
    return tmp_path / "results"


def test_benchmark_missing_file_is_reported_not_raised(client: TestClient, results_dir: Path) -> None:
    for source, needle in (("mvtec", "make eval"), ("synthetic", "make eval-demo")):
        body = client.get("/benchmark", params={"source": source}).json()
        assert body["available"] is False and needle in body["message"] and body["results"] == {}


def test_benchmark_reads_the_file_the_eval_writes(client: TestClient, results_dir: Path) -> None:
    write_results(RESULT, results_dir, {"dataset": "D:/mvtec", "max_side": 1024, "limit": None, "synthetic": False})  # type: ignore[arg-type]
    body = client.get("/benchmark").json()
    assert body["available"] and body["source"] == "mvtec" and body["generated_at"]
    assert body["meta"] == {"dataset": "D:/mvtec", "max_side": 1024, "limit": None, "synthetic": False}
    assert body["results"]["fft"]["carpet"]["f1"] == 0.89 and body["results"]["gabor"]["carpet"]["pixel_iou"] is None
    assert body["results"]["gabor"]["carpet"]["errors"] == ["ValueError: x"]


def test_benchmark_synthetic_source_has_its_own_file(client: TestClient, results_dir: Path) -> None:
    write_results(RESULT, results_dir / "synthetic", {"synthetic": True})  # type: ignore[arg-type]
    assert client.get("/benchmark", params={"source": "synthetic"}).json()["available"] is True
    assert client.get("/benchmark", params={"source": "mvtec"}).json()["available"] is False


def test_benchmark_corrupt_or_wrong_files_do_not_crash(client: TestClient, results_dir: Path) -> None:
    results_dir.mkdir(parents=True)
    path = results_dir / "metrics.json"
    for text, needle in (("{not json", "could not be read"), ('{"results": {"fft": {"carpet": {"accuracy": "x"}}}}', "could not be read"), ('{"meta": {}}', "could not be read"), ('{"results": {}}', "no methods")):
        path.write_text(text)
        body = client.get("/benchmark").json()
        assert body["available"] is False and needle in body["message"]


def test_benchmark_validates_the_source(client: TestClient) -> None:
    assert client.get("/benchmark", params={"source": "other"}).status_code == 422
