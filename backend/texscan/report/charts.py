"""Horizontal bar chart drawn with plain shapes, so labels and spacing stay exactly where the layout wants them."""

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors

from texscan.report.style import CONTENT_W, INK, MUTED, RULE

ROW_H = 15.0
BAR_H = 8.0


def bar_chart(rows: list[tuple[str, float]], color: colors.Color, value_text: list[str], width: float = CONTENT_W, label_w: float = 120.0) -> Drawing:
    """One bar per row, longest bar spans the available width. value_text[i] is printed after bar i."""
    value_w = 52.0
    plot_w = width - label_w - value_w
    peak = max((v for _, v in rows), default=0.0) or 1.0
    height = ROW_H * len(rows) + 4
    drawing = Drawing(width, height)
    drawing.add(Line(label_w, 0, label_w, height, strokeColor=RULE, strokeWidth=0.6))
    for i, (label, value) in enumerate(rows):
        y = height - ROW_H * (i + 1) + (ROW_H - BAR_H) / 2
        length = max(value / peak * plot_w, 1.5 if value > 0 else 0.0)
        drawing.add(String(label_w - 6, y + 1.5, label[:28], fontName="Helvetica", fontSize=8, fillColor=INK, textAnchor="end"))
        drawing.add(Rect(label_w, y, length, BAR_H, fillColor=color, strokeColor=None))
        drawing.add(String(label_w + length + 5, y + 1.5, value_text[i], fontName="Helvetica", fontSize=8, fillColor=MUTED))
    return drawing
