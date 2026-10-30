import json
from pathlib import Path

import numpy as np
import pytest

from texscan.eval.__main__ import main
from texscan.eval.evaluate import ImageOutcome, evaluate_category, summarize
from texscan.eval.metrics import classification_metrics, dice, iou
from texscan.eval.mvtec import (
    DatasetNotFoundError,
    load_category,
    load_gt_mask,
    mvtec_root,
    reference_path,
    subsample,
)
from texscan.eval.report import to_markdown
from texscan.eval.synthetic import make_synthetic_mvtec
from texscan.pipeline import PipelineConfig


@pytest.fixture(scope="module")
def dataset(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return make_synthetic_mvtec(
        tmp_path_factory.mktemp("mvtec"), ("synthetic_sinusoid",), size=256, n_train=1, n_good=3, n_per_defect=2
    )


def test_classification_metrics() -> None:
    m = classification_metrics([1, 1, 1, 0, 0, 0], [1, 1, 0, 1, 0, 0])
    assert (m["tp"], m["fp"], m["tn"], m["fn"]) == (2, 1, 2, 1)
    assert m["accuracy"] == pytest.approx(4 / 6)
    assert m["precision"] == pytest.approx(2 / 3) and m["recall"] == pytest.approx(2 / 3)
    assert m["f1"] == pytest.approx(2 / 3)


def test_classification_metrics_zero_division_is_zero() -> None:
    m = classification_metrics([0, 0], [0, 0])
    assert m["accuracy"] == 1 and m["precision"] == m["recall"] == m["f1"] == 0


def test_iou_and_dice() -> None:
    gt = np.zeros((10, 10), bool)
    gt[:5] = True  # 50 px
    pred = np.zeros((10, 10), bool)
    pred[:, :5] = True  # 50 px, overlap 25
    assert iou(pred, gt) == pytest.approx(25 / 75)
    assert dice(pred, gt) == pytest.approx(50 / 100)
    assert iou(gt, gt) == dice(gt, gt) == 1
    empty = np.zeros_like(gt)
    assert iou(empty, empty) == dice(empty, empty) == 1 and iou(empty, gt) == dice(empty, gt) == 0


def test_mvtec_root_requires_env(tmp_path: Path) -> None:
    with pytest.raises(DatasetNotFoundError, match="MVTEC_PATH"):
        mvtec_root({})
    with pytest.raises(DatasetNotFoundError, match="not a directory"):
        mvtec_root({"MVTEC_PATH": str(tmp_path / "nope")})
    assert mvtec_root({"MVTEC_PATH": str(tmp_path)}) == tmp_path


def test_load_category_and_reference(dataset: Path) -> None:
    samples = load_category(dataset, "synthetic_sinusoid")
    assert len(samples) == 3 + 2 * 2
    assert {s.defect_type for s in samples} == {"good", "scratch", "blob"}
    assert all((s.mask_path is None) == (s.label == 0) for s in samples)
    assert reference_path(dataset, "synthetic_sinusoid").parent.name == "good"
    with pytest.raises(DatasetNotFoundError):
        load_category(dataset, "missing")


def test_subsample_keeps_good_images(dataset: Path) -> None:
    samples = load_category(dataset, "synthetic_sinusoid")
    picked = subsample(samples, 3)
    assert len(picked) == 3 and {s.defect_type for s in picked} == {"good", "scratch", "blob"}
    assert subsample(samples, None) is samples


def test_load_gt_mask_resizes_and_good_is_empty(dataset: Path) -> None:
    samples = load_category(dataset, "synthetic_sinusoid")
    good = next(s for s in samples if s.label == 0)
    bad = next(s for s in samples if s.label == 1)
    assert not load_gt_mask(good, (64, 64)).any()
    mask = load_gt_mask(bad, (128, 128))
    assert mask.shape == (128, 128) and mask.dtype == bool and 0 < mask.sum() < mask.size


def test_summarize_pixel_metrics_use_defective_images_only() -> None:
    outcomes = [
        ImageOutcome(1, 1, 0.5, 0.6, 1.0),
        ImageOutcome(1, 0, 0.0, 0.0, 1.0),
        ImageOutcome(0, 0, None, None, 1.0),
        ImageOutcome(0, 0, None, None, 1.0, error="ValueError: boom"),
    ]
    s = summarize(outcomes)
    assert s["pixel_iou"] == pytest.approx(0.25) and s["n_defective"] == 2 and s["errors"] == ["ValueError: boom"]
    assert s["recall"] == 0.5 and s["accuracy"] == 0.75


@pytest.mark.parametrize("method", ["fft", "golden_template"])
def test_evaluate_category_on_synthetic_data(dataset: Path, method: str) -> None:
    config = PipelineConfig.model_validate({"method": method, "max_side": 256})
    s = evaluate_category(dataset, "synthetic_sinusoid", config)
    assert s["n_images"] == 7 and s["n_defective"] == 4 and s["errors"] == []
    assert s["recall"] == 1 and s["accuracy"] == 1  # clean periodic texture + big defects: easy case
    assert s["pixel_iou"] > 0.3


def test_template_method_needs_training_images(dataset: Path, tmp_path: Path) -> None:
    config = PipelineConfig.model_validate({"method": "golden_template", "max_side": 256})
    (tmp_path / "carpet" / "test" / "good").mkdir(parents=True)  # no train/good folder
    with pytest.raises(DatasetNotFoundError, match="training folder"):
        evaluate_category(tmp_path, "carpet", config)


def test_a_crashing_image_is_recorded_not_fatal(dataset: Path) -> None:
    from texscan.eval.evaluate import evaluate_sample

    sample = load_category(dataset, "synthetic_sinusoid")[0]
    broken = type(sample)(sample.image_path.with_name("missing.png"), None, "good")
    outcome = evaluate_sample(broken, PipelineConfig(), None)
    assert outcome.error and outcome.predicted == 0


def test_markdown_table_keeps_bad_results() -> None:
    bad = summarize([ImageOutcome(1, 0, 0.0, 0.0, 2.0), ImageOutcome(0, 1, None, None, 2.0)])
    md = to_markdown({"gabor": {"wood": bad}})
    assert "| gabor / wood | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 2.00 |" in md
    assert "gabor / mean" in md and "poor numbers are kept" in md


def test_main_errors_clearly_without_dataset(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.delenv("MVTEC_PATH", raising=False)
    assert main([]) == 2
    assert "MVTEC_PATH" in capsys.readouterr().err


def test_main_writes_metrics_files(dataset: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MVTEC_PATH", str(dataset))
    out = tmp_path / "results"
    code = main(["--methods", "fft", "--categories", "synthetic_sinusoid", "--max-side", "256", "--workers", "1", "--out", str(out)])
    assert code == 0
    data = json.loads((out / "metrics.json").read_text())
    assert data["results"]["fft"]["synthetic_sinusoid"]["n_images"] == 7
    assert "fft / synthetic_sinusoid" in (out / "metrics.md").read_text(encoding="utf-8")
