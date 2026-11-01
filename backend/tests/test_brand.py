"""The logo drawn in PDF headers is the same mark as the app's favicon."""

import re
from io import BytesIO
from pathlib import Path

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas

import texscan.main  # noqa: F401  (loads the API first; texscan.report imports it)
from texscan.report.brand import BAR, CELL, CELLS, GAP, ORIGIN, PATTERN, SEAM, SIZE, draw_logo, logo_bars

FAVICON = Path(__file__).resolve().parents[2] / "frontend" / "public" / "favicon.svg"


def test_the_weave_has_fifteen_cells_of_two_bars() -> None:
    assert len(logo_bars()) == 30


def test_cells_and_bars_fill_the_pattern_and_it_is_centred() -> None:
    assert CELLS * CELL + (CELLS - 1) * GAP == pytest.approx(PATTERN)
    assert 2 * BAR + SEAM == pytest.approx(CELL)
    assert 2 * ORIGIN + PATTERN == SIZE


def test_every_bar_is_inside_the_pattern() -> None:
    for x, y, w, h in logo_bars():
        assert ORIGIN - 1e-9 <= x and x + w <= ORIGIN + PATTERN + 1e-9
        assert ORIGIN - 1e-9 <= y and y + h <= ORIGIN + PATTERN + 1e-9


def test_the_pdf_logo_matches_the_favicon_file() -> None:
    svg = FAVICON.read_text(encoding="utf-8")
    group = re.search(r'<g fill="#e2e8f0">(.*?)</g>', svg, re.S)
    assert group, "the favicon has no bar group"
    rects = re.findall(r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"', group.group(1))
    in_file = [tuple(float(v) for v in r) for r in rects]
    assert len(in_file) == len(logo_bars())
    for (fx, fy, fw, fh), (x, y, w, h) in zip(in_file, logo_bars()):
        assert (fx, fy, fw, fh) == pytest.approx((x, y, w, h), abs=2e-3)


def test_draw_logo_paints_onto_a_page() -> None:
    buffer = BytesIO()
    pdf = Canvas(buffer, pagesize=A4)
    draw_logo(pdf, 40, 700, 36)
    pdf.showPage()
    pdf.save()
    assert buffer.getvalue().startswith(b"%PDF") and len(buffer.getvalue()) > 1000
