"""Look and feel shared by both PDF reports: colours, paragraph styles, the page frame and small building blocks."""

from datetime import datetime, timezone
from io import BytesIO
from xml.sax.saxutils import escape

import cv2
import numpy as np
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, Image, PageTemplate, Paragraph, Table, TableStyle

from texscan.report.brand import draw_logo

INK = colors.HexColor("#17202b")
MUTED = colors.HexColor("#5b6675")
RULE = colors.HexColor("#dde3ea")
PANEL = colors.HexColor("#f4f7fa")
PRIMARY = colors.HexColor("#0e7490")  # cyan: neutral UI, same family as the app's primary
PASS = colors.HexColor("#15803d")
FAIL = colors.HexColor("#b91c1c")
SERIES_1 = colors.HexColor("#2a78d6")  # the app's first categorical colour

DEFAULT_KIND = "Surface defect inspection report"  # the running header on the right of every page
MARGIN = 16 * mm
PAGE_W, PAGE_H = A4
CONTENT_W = PAGE_W - 2 * MARGIN
TOP_INSET = 14 * mm  # room for the running header
BOTTOM_INSET = 14 * mm

_BASE = ParagraphStyle("base", fontName="Helvetica", fontSize=9, leading=12, textColor=INK)
STYLES: dict[str, ParagraphStyle] = {
    "body": _BASE,
    "small": ParagraphStyle("small", parent=_BASE, fontSize=8, leading=10.5, textColor=MUTED),
    "title": ParagraphStyle("title", parent=_BASE, fontName="Helvetica-Bold", fontSize=20, leading=24),
    "h2": ParagraphStyle("h2", parent=_BASE, fontName="Helvetica-Bold", fontSize=11.5, leading=14, spaceBefore=14, spaceAfter=6),
    "label": ParagraphStyle("label", parent=_BASE, fontSize=7, leading=9, textColor=MUTED),
    "value": ParagraphStyle("value", parent=_BASE, fontName="Helvetica-Bold", fontSize=10, leading=13),
    "cell": ParagraphStyle("cell", parent=_BASE, fontSize=8, leading=10),
    "cell_head": ParagraphStyle("cell_head", parent=_BASE, fontName="Helvetica-Bold", fontSize=7.5, leading=9.5, textColor=MUTED),
    "cell_right": ParagraphStyle("cell_right", parent=_BASE, fontSize=8, leading=10, alignment=TA_RIGHT),
    "caption": ParagraphStyle("caption", parent=_BASE, fontSize=7.5, leading=9.5, textColor=MUTED),
}


def para(text: str, style: str = "body") -> Paragraph:
    """A paragraph from untrusted text (file names etc.): markup characters are escaped."""
    return Paragraph(escape(text), STYLES[style])


def markup(text: str, style: str = "body") -> Paragraph:
    """A paragraph from our own text that may contain <b>/<font> tags."""
    return Paragraph(text, STYLES[style])


def hex_of(color: colors.Color) -> str:
    return "#" + color.hexval()[2:]


def verdict_color(decision: str) -> colors.Color:
    return PASS if decision == "PASS" else FAIL


def when(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%d %b %Y, %H:%M UTC")


def pretty(name: str | None) -> str:
    return (name or "unknown").replace("_", " ").capitalize().replace("Fft", "FFT")


def encode_image(png: bytes, max_side: int, quality: int = 85) -> tuple[bytes, int, int]:
    """Decode an image, shrink it so its long side is at most max_side, return JPEG bytes and the new size."""
    image = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("could not decode image")
    h, w = image.shape[:2]
    scale = min(1.0, max_side / max(h, w))
    if scale < 1.0:
        image = cv2.resize(image, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise ValueError("could not encode image")
    return buf.tobytes(), image.shape[1], image.shape[0]


def framed(image: Image, width: float, height: float) -> Table:
    """A hairline border so pale images (white masks) still show where they end."""
    table = Table([[image]], colWidths=[width], rowHeights=[height], hAlign="LEFT")
    table.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.5, RULE), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return table


def fitted_image(png: bytes, box_w: float, box_h: float, max_side: int = 1000) -> Table:
    """The image scaled to fit inside box_w x box_h points (aspect ratio kept)."""
    data, w, h = encode_image(png, max_side)
    scale = min(box_w / w, box_h / h)
    return framed(Image(BytesIO(data), width=w * scale, height=h * scale), w * scale, h * scale)


def placeholder(text: str, width: float, height: float) -> Table:
    """A grey box standing in for an image that is not available."""
    box = Table([[para(text, "small")]], colWidths=[width], rowHeights=[height])
    box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PANEL), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return box


def data_table(rows: list[list[Flowable | str]], widths: list[float], header_rows: int = 1) -> Table:
    """A clean table: muted header, thin row rules, repeating header on page breaks."""
    table = Table(rows, colWidths=widths, repeatRows=header_rows)
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, header_rows - 1), 0.8, INK),
        ("LINEBELOW", (0, header_rows), (-1, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))  # fmt: skip
    return table


def stat_row(items: list[tuple[str, str, colors.Color]], width: float = CONTENT_W) -> Table:
    """Equal-width tiles: a small label over a large value."""
    cells = [[markup(f'<font color="{hex_of(c)}">{escape(v)}</font>', "title"), para(label, "label")] for label, v, c in items]
    inner = [Table([[c[0]], [c[1]]], colWidths=[width / len(items) - 8]) for c in cells]
    row = Table([inner], colWidths=[width / len(items)] * len(items))
    row.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("LINEAFTER", (0, 0), (-2, -1), 0.6, colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))  # fmt: skip
    return row


class _NumberedCanvas(Canvas):
    """Draws "Page n of N" in the footer; N is only known after the last page, so pages are held back until save()."""

    def __init__(self, *args: object, footer: str = "", kind: str = DEFAULT_KIND, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)  # type: ignore[arg-type]
        self._footer = footer
        self._kind = kind
        self._saved: list[dict[str, object]] = []

    def showPage(self) -> None:  # noqa: N802 - reportlab API
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self._draw_chrome(total)
            super().showPage()
        super().save()

    def _draw_chrome(self, total: int) -> None:
        self.saveState()
        self.setFillColor(PRIMARY)
        self.rect(0, PAGE_H - 4 * mm, PAGE_W, 4 * mm, stroke=0, fill=1)
        self.setFillColor(INK)
        self.setFont("Helvetica-Bold", 11)
        draw_logo(self, MARGIN, PAGE_H - 14.4 * mm, 7 * mm)
        self.drawString(MARGIN + 9 * mm, PAGE_H - 11 * mm, "TexScan")
        self.setFont("Helvetica", 8)
        self.setFillColor(MUTED)
        self.drawRightString(PAGE_W - MARGIN, PAGE_H - 11 * mm, self._kind)
        self.setStrokeColor(RULE)
        self.setLineWidth(0.5)
        self.line(MARGIN, 11 * mm, PAGE_W - MARGIN, 11 * mm)
        self.drawString(MARGIN, 7 * mm, self._footer)
        self.drawRightString(PAGE_W - MARGIN, 7 * mm, f"Page {self._pageNumber} of {total}")
        self.restoreState()


def build_pdf(story: list[Flowable], title: str, footer: str, kind: str = DEFAULT_KIND) -> bytes:
    """Lay the flowables out on A4 pages with the shared header and footer and return the PDF bytes."""
    buffer = BytesIO()
    doc = BaseDocTemplate(buffer, pagesize=A4, title=title, author="TexScan", leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN + TOP_INSET, bottomMargin=BOTTOM_INSET + 6 * mm)
    frame = Frame(MARGIN, BOTTOM_INSET + 6 * mm, CONTENT_W, PAGE_H - 2 * MARGIN - TOP_INSET - 6 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame])])
    doc.build(story, canvasmaker=lambda *a, **k: _NumberedCanvas(*a, footer=footer, kind=kind, **k))
    return buffer.getvalue()
