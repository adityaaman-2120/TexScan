"""PDF report for one roll: details, score and grade, defect map, defect list with position and points, signature lines.

The layout follows what a buyer or supplier expects from a four-point inspection record.
"""

from dataclasses import dataclass

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, KeepTogether, Spacer, Table, TableStyle

from texscan.api.roll_schemas import RollOut
from texscan.grading import MAX_POINTS_PER_YARD
from texscan.report.style import CONTENT_W, FAIL, INK, MUTED, PASS, RULE, build_pdf, data_table, markup, para, pretty, stat_row, when

MAX_DEFECT_ROWS = 60
MAP_HEIGHT = 34 * mm
POINT_COLORS = {1: colors.HexColor("#5b6675"), 2: colors.HexColor("#d9a400"), 3: colors.HexColor("#e8710a"), 4: colors.HexColor("#b91c1c")}

RULES = [
    "Points per defect, by its longest dimension: up to 3 in = 1, over 3 to 6 in = 2, over 6 to 9 in = 3, over 9 in = 4.",
    "Holes and openings: {holes}.",
    "At most 4 points are charged for any one linear yard. A defect running along more than one yard scores 4 in every yard it passes.",
    "Points per 100 sq yd = total points x 36 x 100 / (length inspected in yd x width in inches).",
    "Accepted when points per 100 sq yd are not more than the limit of {limit:g}.",
]


@dataclass
class RollReportData:
    roll: RollOut


def _fmt_in(inches: float) -> str:
    return f"{inches:.1f} in"


def _details(roll: RollOut) -> Table:
    s = roll.summary
    cells = [
        ("ROLL ID", roll.code), ("SUPPLIER", roll.supplier or "-"), ("FABRIC", roll.fabric or "-"),
        ("PROFILE", roll.profile_name or "-"), ("WIDTH (CUTTABLE)", f"{roll.width_in:.1f} in ({roll.width_mm:.0f} mm)"),
        ("LENGTH", f"{roll.length_yd:.1f} yd ({roll.length_m:.1f} m)"),
        ("LENGTH INSPECTED", f"{s.length_inspected_yd:.1f} yd ({s.length_inspected_m:.1f} m)"), ("CAPTURES", str(s.capture_count)),
        ("STATUS", "Complete" if roll.status == "complete" else "In progress (provisional)"),
    ]  # fmt: skip
    grid = [[[para(label, "label"), para(value, "value")] for label, value in cells[i : i + 3]] for i in (0, 3, 6)]
    table = Table(grid, colWidths=[CONTENT_W / 3] * 3)
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LINEBELOW", (0, -1), (-1, -1), 0.6, RULE)]))  # fmt: skip
    return table


def _result(roll: RollOut) -> list[Flowable]:
    s = roll.summary
    verdict = PASS if s.accepted else FAIL
    tiles = stat_row([
        ("TOTAL POINTS", str(s.total_points), INK),
        ("POINTS / 100 SQ YD", f"{s.points_per_100_sq_yd:.1f}", verdict),
        ("ACCEPTANCE LIMIT", f"{roll.limit:g}", INK),
        ("RESULT", "ACCEPT" if s.accepted else "REJECT", verdict),
    ])  # fmt: skip
    note = f"Grade: <b>{s.grade}</b>" + ("  (provisional: the roll has not been marked complete)" if s.provisional else "")
    return [tiles, Spacer(1, 2 * mm), markup(note, "body")]


def defect_map(roll: RollOut, width: float = CONTENT_W, height: float = MAP_HEIGHT) -> Drawing:
    """The roll as a horizontal strip with one marker per defect, coloured by its points, and a metre scale."""
    drawing = Drawing(width, height)
    pad = 6
    strip_y, strip_h = 14, height - 30
    usable = width - 2 * pad
    drawing.add(Rect(pad, strip_y, usable, strip_h, fillColor=colors.HexColor("#f4f7fa"), strokeColor=RULE, strokeWidth=0.6))
    length = max(roll.length_m, 1e-9)
    ticks = 10
    for i in range(ticks + 1):
        x = pad + usable * i / ticks
        drawing.add(Line(x, strip_y - 2, x, strip_y, strokeColor=MUTED, strokeWidth=0.5))
        drawing.add(String(x, strip_y - 10, f"{length * i / ticks:g} m", fontSize=6, fillColor=MUTED, textAnchor="middle"))
    for d in roll.defects:
        x0 = pad + usable * max(d.start_m, 0) / length
        x1 = pad + usable * min(d.end_m, length) / length
        color = POINT_COLORS[d.points]
        if x1 - x0 > 2:  # a defect that runs along the roll is drawn as a bar
            drawing.add(Rect(x0, strip_y + 2, x1 - x0, strip_h - 4, fillColor=color, strokeColor=None, fillOpacity=0.45))
        x = pad + usable * d.position_m / length
        drawing.add(Line(x, strip_y, x, strip_y + strip_h, strokeColor=color, strokeWidth=1.6))
    drawing.add(String(pad, height - 9, "Roll start", fontSize=6.5, fillColor=MUTED))
    drawing.add(String(width - pad, height - 9, "Roll end", fontSize=6.5, fillColor=MUTED, textAnchor="end"))
    for i, (points, color) in enumerate(POINT_COLORS.items()):  # legend: colour = points
        x = width / 2 - 70 + i * 36
        drawing.add(Rect(x, height - 10, 6, 6, fillColor=color, strokeColor=None))
        drawing.add(String(x + 9, height - 9, f"{points} pt", fontSize=6.5, fillColor=MUTED))
    return drawing


def _defects(roll: RollOut) -> list[Flowable]:
    if not roll.defects:
        return [para("No defects were scored on this roll.", "small")]
    head = [para(h, "cell_head") for h in ("#", "Position", "Yard", "Type", "Length", "Width", "Points", "Capture")]
    rows = [head]
    captures = {c.id: c for c in roll.captures}
    for i, d in enumerate(roll.defects[:MAX_DEFECT_ROWS], start=1):
        kind = pretty(d.defect_type) + (" (continuous)" if d.continuous else "")
        rows.append([
            para(str(i), "cell"), para(f"{d.position_m:.2f} m ({d.position_yd:.1f} yd)", "cell"), para(str(int(d.position_yd // 1) + 1), "cell"),
            para(kind, "cell"), para(f"{_fmt_in(d.length_in)} ({d.length_mm:.0f} mm)", "cell"), para(f"{_fmt_in(d.width_in)} ({d.width_mm:.0f} mm)", "cell"),
            markup(f"<b>{d.points}</b>", "cell"), para(captures[d.capture_id].filename[:24] if d.capture_id in captures else "-", "cell"),
        ])  # fmt: skip
    widths = [w * mm for w in (8, 34, 11, 28, 28, 24, 12, 32)]
    out: list[Flowable] = [data_table(rows, [w * CONTENT_W / sum(widths) for w in widths])]
    if len(roll.defects) > MAX_DEFECT_ROWS:
        out += [Spacer(1, 2 * mm), para(f"Showing the first {MAX_DEFECT_ROWS} of {len(roll.defects)} defects.", "small")]
    capped = [y for y in roll.summary.yards if y.raw > y.points]
    if capped:
        text = "; ".join(f"yard {y.yard + 1} ({y.from_m:.1f} to {y.to_m:.1f} m): {y.raw} points capped to {MAX_POINTS_PER_YARD}" for y in capped[:12])
        out += [Spacer(1, 2 * mm), para(f"Per-yard cap applied: {text}.", "small")]
    return out


def _rules(roll: RollOut) -> list[Flowable]:
    holes = "1 in or less = 2 points, over 1 in = 4 points" if roll.hole_rule == "tiered" else "any hole or opening = 4 points"
    return [para(f"{i}. " + rule.format(holes=holes, limit=roll.limit), "small") for i, rule in enumerate(RULES, start=1)]


def _signatures(roll: RollOut) -> Table:
    def line(label: str, name: str = "") -> list[Flowable]:
        return [para(label, "label"), Spacer(1, 11 * mm), para(name, "cell")]

    grid = [
        [line("QC INSPECTOR (NAME)", roll.inspector), line("SIGNATURE"), line("DATE")],
        [line("SUPPLIER REPRESENTATIVE (NAME)"), line("SIGNATURE"), line("DATE")],
    ]
    table = Table(grid, colWidths=[CONTENT_W * 0.42, CONTENT_W * 0.38, CONTENT_W * 0.2])
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LINEBELOW", (0, 0), (-1, -1), 0.6, INK), ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 1), (-1, 1), 8)]))  # fmt: skip
    return table


def roll_report(data: RollReportData) -> bytes:
    """Render the roll report and return the PDF bytes."""
    roll = data.roll
    s = roll.summary
    story: list[Flowable] = [
        markup("Fabric roll inspection report", "title"), Spacer(1, 1 * mm),
        para("Four-point system (ASTM D5430 method). Positions are metres from the start of the roll.", "small"), Spacer(1, 4 * mm),
        _details(roll), Spacer(1, 4 * mm), *_result(roll),
        KeepTogether([markup("<b>Defect map</b>", "h2"), defect_map(roll), para("Each line is a defect at its position on the roll, coloured by points.", "caption")]),
        KeepTogether([markup("<b>Defects</b>", "h2"), *_defects(roll)]),
    ]  # fmt: skip
    if s.warnings:
        story += [markup("<b>Notes</b>", "h2"), *[para("- " + w, "small") for w in s.warnings]]
    if roll.notes:
        story += [markup("<b>Inspector notes</b>", "h2"), para(roll.notes, "body")]
    story += [
        KeepTogether([markup("<b>Scoring rules used</b>", "h2"), *_rules(roll)]),
        Spacer(1, 8 * mm),
        KeepTogether([markup("<b>Sign-off</b>", "h2"), _signatures(roll), Spacer(1, 2 * mm), para(f"Report generated {when(roll.updated_at)} by TexScan.", "caption")]),
    ]  # fmt: skip
    return build_pdf(story, f"TexScan roll report {roll.code}", f"Roll {roll.code[:40]}  |  {roll.supplier[:40]}", kind="Fabric roll inspection report")
