import json
from pathlib import Path
from typing import Any

Results = dict[str, dict[str, dict[str, Any]]]

_COLUMNS = ("accuracy", "precision", "recall", "f1", "pixel_iou", "pixel_dice")


def _fmt(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.3f}"


def _mean(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return sum(present) / len(present) if present else None


def _row(label: str, cells: dict[str, Any]) -> str:
    metrics = " | ".join(_fmt(cells[c]) for c in _COLUMNS)
    return f"| {label} | {metrics} | {cells['seconds_per_image']:.2f} | {cells.get('n_images', '')} | {cells.get('errors', '')} |"


def _mean_cells(per_category: dict[str, dict[str, Any]]) -> dict[str, Any]:
    cells: dict[str, Any] = {c: _mean([m[c] for m in per_category.values()]) for c in (*_COLUMNS, "seconds_per_image")}
    cells["seconds_per_image"] = cells["seconds_per_image"] or 0.0
    return cells


def to_markdown(results: Results, title: str = "TexScan evaluation") -> str:
    header = "| Method / category | Accuracy | Precision | Recall | F1 | IoU | Dice | s/img | images | errors |"
    lines = [f"# {title}", "", header, "|" + "---|" * 10]
    for method, per_category in results.items():
        for category, metrics in per_category.items():
            lines.append(_row(f"{method} / {category}", {**metrics, "errors": len(metrics["errors"])}))
        lines.append(_row(f"**{method} / mean**", {**_mean_cells(per_category), "n_images": "", "errors": ""}))
    lines += [
        "",
        "Image-level metrics treat *defective* as the positive class. IoU and Dice are averaged over defective "
        "images only. Every method ran with its default, untuned config; poor numbers are kept as measured.",
    ]
    return "\n".join(lines) + "\n"


def write_results(results: Results, out_dir: Path, meta: dict[str, Any], title: str = "TexScan evaluation") -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "metrics.json").write_text(json.dumps({"meta": meta, "results": results}, indent=2))
    (out_dir / "metrics.md").write_text(to_markdown(results, title), encoding="utf-8")
