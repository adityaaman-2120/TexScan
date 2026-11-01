"""Printable calibration marker: an ArUco marker drawn at its exact size, with a scale bar to check the printer."""

from io import BytesIO

import cv2
import numpy as np
from numpy.typing import NDArray
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from texscan.pipeline.measure import DEFAULT_DICTIONARY, MARKER_ID

MIN_SIDE_MM = 10.0
MAX_SIDE_MM = 150.0
CELLS = 6  # 4 x 4 data bits plus a one-cell black border
SCALE_BAR_MM = 100.0


def marker_cells(marker_id: int = MARKER_ID, dictionary: str = DEFAULT_DICTIONARY) -> NDArray[np.bool_]:
    """The marker as a (6, 6) grid, True where a cell is black (outer border included)."""
    aruco = cv2.aruco
    grid = aruco.generateImageMarker(aruco.getPredefinedDictionary(getattr(aruco, dictionary)), marker_id, CELLS)
    return np.asarray(grid) == 0


def cell_mm(side_mm: float) -> float:
    """Edge of one marker cell: the printed black square is exactly CELLS of them."""
    return side_mm / CELLS


def marker_pdf(side_mm: float, marker_id: int = MARKER_ID) -> bytes:
    """A4 page with the marker's black square exactly side_mm wide, a 100 mm check bar and printing instructions."""
    if not MIN_SIDE_MM <= side_mm <= MAX_SIDE_MM:
        raise ValueError(f"the marker side must be between {MIN_SIDE_MM:g} and {MAX_SIDE_MM:g} mm")
    buffer = BytesIO()
    page_w, page_h = A4
    pdf = canvas.Canvas(buffer, pagesize=A4, pageCompression=0)  # uncompressed: the page text stays readable in the file
    pdf.setTitle(f"TexScan calibration marker {side_mm:g} mm")

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(20 * mm, page_h - 22 * mm, "TexScan calibration marker")
    pdf.setFont("Helvetica", 12)
    pdf.drawString(20 * mm, page_h - 31 * mm, f"Black square: {side_mm:g} mm x {side_mm:g} mm   (marker ID {marker_id}, 4x4)")

    cell = cell_mm(side_mm) * mm
    left = (page_w - side_mm * mm) / 2
    top = page_h - 60 * mm
    pdf.setFillColorRGB(0, 0, 0)
    for row, line in enumerate(marker_cells(marker_id)):
        for col, black in enumerate(line):
            if black:
                pdf.rect(left + col * cell, top - (row + 1) * cell, cell, cell, stroke=0, fill=1)

    y = top - side_mm * mm - cell - 8 * mm  # keep one empty cell of white around the marker
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawCentredString(page_w / 2, y, f"{side_mm:g} mm")

    bar_y = y - 14 * mm
    bar_left = (page_w - SCALE_BAR_MM * mm) / 2
    pdf.setLineWidth(0.6)
    pdf.line(bar_left, bar_y, bar_left + SCALE_BAR_MM * mm, bar_y)
    for step in range(int(SCALE_BAR_MM / 10) + 1):
        tick = 3 * mm if step % 5 == 0 else 1.8 * mm
        pdf.line(bar_left + step * 10 * mm, bar_y, bar_left + step * 10 * mm, bar_y + tick)
    pdf.setFont("Helvetica", 8)
    for step in (0, 5, 10):
        pdf.drawCentredString(bar_left + step * 10 * mm, bar_y - 4 * mm, f"{step * 10} mm")
    pdf.setFont("Helvetica", 9)
    notes = [
        "Print at 100% (Actual size). Do not use Fit to page or Scale to fit.",
        "Check: the bar above must measure exactly 100 mm with a ruler. If not, print again.",
        "Stick the page flat and place it in the camera's view at the same height as the fabric.",
        "Keep the whole marker in the picture, sharp, well lit and not tilted.",
    ]
    for i, note in enumerate(notes):
        pdf.drawString(20 * mm, bar_y - (13 + 5 * i) * mm, note)
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
