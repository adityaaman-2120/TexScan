"""The TexScan mark for the PDF header.

Same geometry as frontend/src/components/logoGeometry.ts (a 4 x 4 basket weave of rounded bars with a viewfinder cell on a
dark tile); tests/test_brand.py checks it against the favicon file, which the frontend test keeps equal to that code.
"""

from reportlab.lib import colors
from reportlab.pdfgen.canvas import Canvas

SIZE = 64.0
TILE_RADIUS = 14.0
PATTERN = 44.0
ORIGIN = 10.0
CELLS = 4
BAR_RADIUS = 1.05
FINDER_CELL = (1, 2)  # (row, column)
FINDER_STROKE = 1.25
FINDER_RADIUS = 2.1
FINDER_DOT = 1.5

TILE = colors.HexColor("#0f172a")
BAR_COLOR = colors.HexColor("#e2e8f0")
ACCENT = colors.HexColor("#22d3ee")

CELL = PATTERN * 2 / 9
GAP = PATTERN / 27
BAR = CELL * 0.4
SEAM = CELL * 0.2

Rect = tuple[float, float, float, float]  # x, y, width, height in the 64 x 64 design box (y downwards)


def cell_origin(row: int, col: int) -> tuple[float, float]:
    return ORIGIN + col * (CELL + GAP), ORIGIN + row * (CELL + GAP)


def logo_bars() -> list[Rect]:
    """Every bar of the weave, row by row, leaving out the viewfinder cell. Cells on even diagonals lie across."""
    bars: list[Rect] = []
    for row in range(CELLS):
        for col in range(CELLS):
            if (row, col) == FINDER_CELL:
                continue
            x, y = cell_origin(row, col)
            if (row + col) % 2 == 0:
                bars += [(x, y, CELL, BAR), (x, y + BAR + SEAM, CELL, BAR)]
            else:
                bars += [(x, y, BAR, CELL), (x + BAR + SEAM, y, BAR, CELL)]
    return bars


def draw_logo(canvas: Canvas, x: float, y: float, size: float) -> None:
    """Draw the mark with its lower-left corner at (x, y), `size` points wide."""
    k = size / SIZE
    canvas.saveState()
    canvas.translate(x, y + size)
    canvas.scale(k, -k)  # from here on, design-box coordinates with y pointing down
    canvas.setFillColor(TILE)
    canvas.roundRect(0, 0, SIZE, SIZE, TILE_RADIUS, stroke=0, fill=1)
    canvas.setFillColor(BAR_COLOR)
    for bx, by, bw, bh in logo_bars():
        canvas.roundRect(bx, by, bw, bh, BAR_RADIUS, stroke=0, fill=1)
    fx, fy = cell_origin(*FINDER_CELL)
    inset = FINDER_STROKE / 2
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(FINDER_STROKE)
    canvas.roundRect(fx + inset, fy + inset, CELL - FINDER_STROKE, CELL - FINDER_STROKE, FINDER_RADIUS, stroke=1, fill=0)
    canvas.setFillColor(ACCENT)
    canvas.circle(fx + CELL / 2, fy + CELL / 2, FINDER_DOT, stroke=0, fill=1)
    canvas.restoreState()
