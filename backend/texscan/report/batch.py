"""PDF report for a batch: summary KPIs, defect-type breakdown, a table of every image and the overlays of the failed ones."""

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime

from reportlab.lib.units import mm
from reportlab.platypus import Flowable, CondPageBreak, KeepTogether, Spacer, Table, TableStyle

from texscan.report.charts import bar_chart
from texscan.report.style import (
    CONTENT_W, FAIL, INK, PASS, RULE, SERIES_1, build_pdf, data_table, fitted_image, hex_of, markup, para, placeholder, pretty, stat_row, verdict_color, when,
)  # fmt: skip

OVERLAY_COLUMNS = 3
MAX_OVERLAYS = 60


@dataclass
class BatchItem:
    inspection_id: int
    filename: str
    decision: str
    defect_count: int
    defect_area_percent: float
    total_ms: float
    types: dict[str, int]
    overlay_png: bytes | None = None  # only loaded for failed items


@dataclass
class BatchReportData:
    batch_id: str
    items: list[BatchItem]
    method: str
    profile_name: str | None
    started: datetime
    finished: datetime
    notes: list[str] = field(default_factory=list)  # e.g. "2 files could not be read"


def type_totals(items: list[BatchItem]) -> Counter[str]:
    """Defects per type across the whole batch."""
    totals: Counter[str] = Counter()
    for item in items:
        totals.update(item.types)
    return totals


def summary(items: list[BatchItem]) -> dict[str, float]:
    """The headline numbers. Pass rate and means are 0 for an empty batch."""
    n = len(items)
    failed = sum(i.decision == "FAIL" for i in items)
    return {
        "total": n, "passed": n - failed, "failed": failed,
        "pass_rate": (n - failed) / n * 100 if n else 0.0,
        "defects": sum(i.defect_count for i in items),
        "mean_area": sum(i.defect_area_percent for i in items) / n if n else 0.0,
        "mean_ms": sum(i.total_ms for i in items) / n if n else 0.0,
    }  # fmt: skip


def _meta(data: BatchReportData) -> Table:
    cells = [
        ("STARTED", when(data.started)), ("FINISHED", when(data.finished)), ("PROFILE", data.profile_name or "None (default settings)"), ("METHOD", data.method.replace("_", " ")),
    ]  # fmt: skip
    table = Table([[[para(label, "label"), para(value, "value")] for label, value in cells]], colWidths=[CONTENT_W / 4] * 4)
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LINEBELOW", (0, -1), (-1, -1), 0.6, RULE)]))  # fmt: skip
    return table


def _kpis(items: list[BatchItem]) -> list[Flowable]:
    s = summary(items)
    first = stat_row([
        ("IMAGES", str(int(s["total"])), INK), ("PASSED", str(int(s["passed"])), PASS),
        ("FAILED", str(int(s["failed"])), FAIL if s["failed"] else INK), ("PASS RATE", f"{s['pass_rate']:.0f}%", INK),
    ])  # fmt: skip
    second = stat_row([
        ("TOTAL DEFECTS", str(int(s["defects"])), INK), ("MEAN DEFECT AREA", f"{s['mean_area']:.2f}%", INK), ("MEAN TIME PER IMAGE", f"{s['mean_ms']:.0f} ms", INK),
    ])  # fmt: skip
    return [first, Spacer(1, 1.5 * mm), second]


def _breakdown(items: list[BatchItem]) -> list[Flowable]:
    totals = type_totals(items).most_common()
    if not totals:
        return [para("No defects were found in this batch.", "small")]
    total = sum(n for _, n in totals)
    rows = [(pretty(name), float(n)) for name, n in totals]
    labels = [f"{n}  ({n / total:.0%})" for _, n in totals]
    return [bar_chart(rows, SERIES_1, labels), Spacer(1, 2 * mm), para(f"{total} defects in {sum(i.defect_count > 0 for i in items)} images. Bars show the number of defects per type.", "caption")]


def _item_table(items: list[BatchItem]) -> Table:
    head = [para(h, "cell_head") for h in ("#", "File", "Result", "Defects", "Area", "Time", "Types")]
    rows: list[list[Flowable | str]] = [head]
    for i, item in enumerate(items, 1):
        types = ", ".join(f"{pretty(t)} x{n}" if n > 1 else pretty(t) for t, n in sorted(item.types.items(), key=lambda kv: -kv[1]))
        color = hex_of(verdict_color(item.decision))
        rows.append([
            para(str(i), "cell"), para(item.filename, "cell"), markup(f'<font color="{color}"><b>{item.decision}</b></font>', "cell"),
            para(str(item.defect_count), "cell_right"), para(f"{item.defect_area_percent:.2f}%", "cell_right"), para(f"{item.total_ms:.0f} ms", "cell_right"), para(types or "-", "cell"),
        ])  # fmt: skip
    weights = [7, 50, 15, 14, 16, 16, 52]
    return data_table(rows, [w * CONTENT_W / sum(weights) for w in weights])


def _overlay_grid(items: list[BatchItem]) -> list[Flowable]:
    failed = [i for i in items if i.decision == "FAIL"]
    if not failed:
        return [para("Every image passed, so there are no failed overlays to show.", "small")]
    shown = failed[:MAX_OVERLAYS]
    width = CONTENT_W / OVERLAY_COLUMNS
    img_w, img_h = width - 5 * mm, 46 * mm
    cells: list[list[Flowable]] = []
    for item in shown:
        picture = fitted_image(item.overlay_png, img_w, img_h, 520) if item.overlay_png else placeholder("Overlay not available", img_w, img_h)
        detail = f"{item.defect_count} {'defect' if item.defect_count == 1 else 'defects'}, {item.defect_area_percent:.2f}% area"
        cells.append([picture, Spacer(1, 1.5 * mm), para(item.filename[:46], "cell"), para(detail, "caption")])
    cells += [[]] * (-len(cells) % OVERLAY_COLUMNS)
    rows = [cells[i : i + OVERLAY_COLUMNS] for i in range(0, len(cells), OVERLAY_COLUMNS)]
    table = Table(rows, colWidths=[width] * OVERLAY_COLUMNS)
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    out: list[Flowable] = [table]
    if len(failed) > len(shown):
        out.append(para(f"Showing {len(shown)} of {len(failed)} failed images.", "small"))
    return out


def batch_report(data: BatchReportData) -> bytes:
    """Render the report and return the PDF bytes."""
    n = len(data.items)
    story: list[Flowable] = [markup("Batch report", "title"), Spacer(1, 3 * mm), _meta(data), Spacer(1, 4 * mm), *_kpis(data.items)]
    story += [Spacer(1, 3 * mm), *(para(note, "small") for note in data.notes)]
    story += [KeepTogether([markup("<b>Defect types</b>", "h2"), *_breakdown(data.items)])]
    story += [markup(f"<b>All images ({n})</b>", "h2"), _item_table(data.items)]
    story += [CondPageBreak(90 * mm), markup("<b>Failed images</b>", "h2"), *_overlay_grid(data.items)]
    return build_pdf(story, f"TexScan batch {data.batch_id[:8]}", f"Batch {data.batch_id[:8]}  |  {n} images")


__all__ = ["BatchItem", "BatchReportData", "batch_report", "summary", "type_totals"]
