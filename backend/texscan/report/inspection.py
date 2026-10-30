"""PDF report for one inspection: verdict, original and overlay, defect table, pipeline stage strip, config and timings."""

from dataclasses import dataclass, field
from xml.sax.saxutils import escape

from reportlab.lib.units import mm
from reportlab.platypus import Flowable, KeepTogether, Spacer, Table, TableStyle

from texscan.api.schemas import InspectionOut
from texscan.report.charts import bar_chart
from texscan.report.style import (
    CONTENT_W, INK, PRIMARY, RULE, build_pdf, data_table, fitted_image, markup, para, placeholder, pretty, stat_row, verdict_color, when,
)  # fmt: skip

STAGE_TITLES = {
    "gray": "Grayscale", "denoised": "Denoised", "enhanced": "Contrast enhanced", "spectrum": "Frequency spectrum",
    "spectrum_peaks": "Detected peaks", "notch_mask": "Notch filter", "residual": "Residual", "residual_abs": "Deviation map",
    "gabor_energy": "Gabor energy", "anomaly_score": "Anomaly score", "aligned_reference": "Aligned reference", "difference": "Difference",
    "local_mean": "Local mean", "local_variance": "Local variance", "mask_raw": "Raw defect mask", "mask_clean": "Cleaned mask", "overlay": "Result overlay",
}  # fmt: skip
SKIPPED_STAGES = {"upload", "original"}  # shown large elsewhere
METHOD_SECTIONS = {"fft": ("peaks", "notch"), "gabor": ("gabor",), "golden_template": ("template",), "local_statistics": ("local_stats",)}
ALL_METHOD_SECTIONS = {s for sections in METHOD_SECTIONS.values() for s in sections}
STRIP_COLUMNS = 6
MAX_DEFECT_ROWS = 40


@dataclass
class InspectionReportData:
    inspection: InspectionOut
    profile_name: str | None
    images: dict[str, bytes] = field(default_factory=dict)  # stage name -> PNG bytes (missing files are simply absent)


def _fmt(value: object) -> str:
    return f"{value:g}" if isinstance(value, float) else str(value)


def config_rows(data: InspectionReportData) -> list[tuple[str, str]]:
    """Flat (setting, value) rows: the shared steps, then only the sections that belong to the chosen method."""
    config = data.inspection.config.model_dump()
    sections = ["denoise", "enhance", *METHOD_SECTIONS[config["method"]], "threshold", "morphology"]
    rows = [("method", config["method"]), ("max side", f"{config['max_side']} px")]
    for name in sections:
        rows += [(f"{name.replace('_', ' ')} / {key.replace('_', ' ')}", _fmt(value)) for key, value in config[name].items()]
    rows += [("FAIL if defects >", str(config["max_defects"])), ("FAIL if area % >", _fmt(config["max_area_percent"]))]
    return rows


def _meta(data: InspectionReportData) -> Table:
    out = data.inspection
    cells = [
        ("DATE", when(out.created_at)), ("PROFILE", data.profile_name or "None (default settings)"), ("METHOD", out.config.method.replace("_", " ")),
        ("INSPECTION", f"#{out.id}" + (f"  (batch {out.batch_id[:8]})" if out.batch_id else "")),
        ("WORKING SIZE", f"{out.metrics.image_width} x {out.metrics.image_height} px"), ("FILE", out.filename),
    ]  # fmt: skip
    grid = [[[para(label, "label"), para(value, "value")] for label, value in cells[i : i + 3]] for i in (0, 3)]
    table = Table(grid, colWidths=[CONTENT_W / 3] * 3)
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LINEBELOW", (0, -1), (-1, -1), 0.6, RULE)]))  # fmt: skip
    return table


def _stats(data: InspectionReportData) -> Table:
    out = data.inspection
    return stat_row([
        ("RESULT", out.decision, verdict_color(out.decision)),
        ("DEFECTS", str(out.metrics.defect_count), INK),
        ("DEFECT AREA", f"{out.metrics.defect_area_percent:.2f}%", INK),
        ("LARGEST DEFECT", f"{out.metrics.largest_defect_area} px", INK),
        ("PROCESSING", f"{out.metrics.total_ms:.0f} ms", INK),
    ])  # fmt: skip


def _picture(data: InspectionReportData, name: str, caption: str, width: float, height: float) -> list[Flowable]:
    png = data.images.get(name)
    picture: Flowable = fitted_image(png, width, height) if png else placeholder("Image not available", width, height)
    return [picture, Spacer(1, 2 * mm), para(caption, "caption")]


def _images(data: InspectionReportData) -> Table:
    gap = 6 * mm
    width = (CONTENT_W - gap) / 2
    cells = [_picture(data, "upload", "Original upload", width, 92 * mm), _picture(data, "overlay", "Result: detected defects outlined", width, 92 * mm)]
    table = Table([cells], colWidths=[width + gap / 2] * 2)
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return table


def _defects(data: InspectionReportData) -> list[Flowable]:
    defects = data.inspection.defects
    if not defects:
        return [para("No defects were found.", "small")]
    head = [para(h, "cell_head") for h in ("#", "Type", "Confidence", "Position (x, y)", "Size (w x h)", "Area (px)", "Aspect", "Solidity", "Contrast")]
    rows = [head]
    for d in defects[:MAX_DEFECT_ROWS]:
        rows.append([
            para(str(d.id), "cell"), markup(f"<b>{pretty(d.defect_type)}</b>", "cell"),
            para("-" if d.type_confidence is None else f"{d.type_confidence:.0%}", "cell"),
            para(f"{d.bbox[0]}, {d.bbox[1]}", "cell"), para(f"{d.bbox[2]} x {d.bbox[3]}", "cell"), para(str(d.area), "cell"),
            para(f"{d.aspect_ratio:.2f}", "cell"), para(f"{d.solidity:.2f}", "cell"), para("-" if d.contrast is None else f"{d.contrast:+.0f}", "cell"),
        ])  # fmt: skip
    widths = [w * mm for w in (9, 27, 20, 26, 24, 19, 16, 17, 16)]
    out: list[Flowable] = [data_table(rows, [w * CONTENT_W / sum(widths) for w in widths])]
    if len(defects) > MAX_DEFECT_ROWS:
        out += [Spacer(1, 2 * mm), para(f"Showing the first {MAX_DEFECT_ROWS} of {len(defects)} defects.", "small")]
    return out


def _strip(data: InspectionReportData) -> list[Flowable]:
    names = [n for n in data.inspection.stage_urls if n not in SKIPPED_STAGES and n in data.images]
    if not names:
        return [para("Stage images are not available for this inspection.", "small")]
    width = CONTENT_W / STRIP_COLUMNS
    thumb_w, thumb_h = width - 4 * mm, 24 * mm
    cells = [[fitted_image(data.images[n], thumb_w, thumb_h, 360), Spacer(1, 1.5 * mm), para(f"{i + 1}. {STAGE_TITLES.get(n, pretty(n))}", "caption")] for i, n in enumerate(names)]
    cells += [""] * (-len(cells) % STRIP_COLUMNS)
    rows = [cells[i : i + STRIP_COLUMNS] for i in range(0, len(cells), STRIP_COLUMNS)]
    table = Table(rows, colWidths=[width] * STRIP_COLUMNS)
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return [table]


def _config_table(data: InspectionReportData) -> Table:
    rows = config_rows(data)
    half = (len(rows) + 1) // 2
    left, right = rows[:half], rows[half:] + [("", "")] * (2 * half - len(rows))
    merged = [
        [markup(f'<font color="#5b6675">{escape(lk)}</font>', "cell"), para(lv, "cell"), "", markup(f'<font color="#5b6675">{escape(rk)}</font>', "cell"), para(rv, "cell")]
        for (lk, lv), (rk, rv) in zip(left, right)
    ]  # fmt: skip
    gap = 8 * mm
    col = (CONTENT_W - gap) / 2
    table = Table(merged, colWidths=[col * 0.62, col * 0.38, gap, col * 0.62, col * 0.38])
    table.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (1, -1), 0.4, RULE), ("LINEBELOW", (3, 0), (4, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5), ("LEFTPADDING", (0, 0), (-1, -1), 2),
    ]))  # fmt: skip
    return table


def _timings(data: InspectionReportData) -> Flowable:
    items = sorted(data.inspection.timings_ms.items(), key=lambda kv: -kv[1])
    return bar_chart([(pretty(k), v) for k, v in items], PRIMARY, [f"{v:.1f} ms" for _, v in items])


def _section(title: str, body: list[Flowable]) -> KeepTogether:
    return KeepTogether([markup(f"<b>{title}</b>", "h2"), *body])


def inspection_report(data: InspectionReportData) -> bytes:
    """Render the report and return the PDF bytes."""
    out = data.inspection
    story: list[Flowable] = [
        markup("Inspection report", "title"), Spacer(1, 3 * mm), _meta(data), Spacer(1, 4 * mm), _stats(data), Spacer(1, 6 * mm), _images(data),
        _section("Defects", _defects(data)),
        _section("Pipeline stages", _strip(data)),
        _section("Configuration used", [_config_table(data)]),
        _section(f"Timings (total {out.metrics.total_ms:.1f} ms)", [_timings(data)]),
    ]  # fmt: skip
    return build_pdf(story, f"TexScan inspection #{out.id}", f"Inspection #{out.id}  |  {out.filename[:70]}")

