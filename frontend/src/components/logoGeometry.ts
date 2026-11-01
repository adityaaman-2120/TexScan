/**
 * The TexScan mark, defined once as numbers. A 4 x 4 basket weave: each cell is a pair of rounded bars, lying across or
 * standing up in a checkerboard. One cell is a scanner's viewfinder (a cyan square with a dot): the spot being inspected.
 *
 * The same geometry draws the React logo, the static favicon (public/favicon.svg, kept equal by logoGeometry.test.ts) and the PDF
 * header (backend/texscan/report/brand.py, kept equal by tests/test_brand.py).
 */

export const LOGO = {
  size: 64, // the viewBox
  tileRadius: 14,
  patternSize: 44,
  origin: 10,
  cells: 4,
  barRadius: 1.05,
  /** the viewfinder cell (row, column) */
  finder: { row: 1, col: 2, stroke: 1.25, radius: 2.1, dot: 1.5 },
  colors: { tile: "#0f172a", bar: "#e2e8f0", accent: "#22d3ee", edge: "#94a3b8" },
} as const;

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Side of one cell, and the gap between cells: 4 cells and 3 gaps fill the pattern exactly. */
export const CELL = (LOGO.patternSize * 2) / 9;
export const GAP = LOGO.patternSize / 27;
/** Thickness of a bar and the gap between the two bars of a cell: 2 bars and 1 gap fill the cell. */
export const BAR = CELL * 0.4;
export const SEAM = CELL * 0.2;

export function cellOrigin(row: number, col: number): { x: number; y: number } {
  return { x: LOGO.origin + col * (CELL + GAP), y: LOGO.origin + row * (CELL + GAP) };
}

/** Cells on the even diagonals lie across; the others stand up. */
export const lyingAcross = (row: number, col: number): boolean => (row + col) % 2 === 0;

export const isFinder = (row: number, col: number): boolean => row === LOGO.finder.row && col === LOGO.finder.col;

/** Every bar of the weave, row by row, leaving out the viewfinder cell. */
export function logoBars(): Bar[] {
  const bars: Bar[] = [];
  for (let row = 0; row < LOGO.cells; row++) {
    for (let col = 0; col < LOGO.cells; col++) {
      if (isFinder(row, col)) continue;
      const { x, y } = cellOrigin(row, col);
      if (lyingAcross(row, col)) {
        bars.push({ x, y, width: CELL, height: BAR }, { x, y: y + BAR + SEAM, width: CELL, height: BAR });
      } else {
        bars.push({ x, y, width: BAR, height: CELL }, { x: x + BAR + SEAM, y, width: BAR, height: CELL });
      }
    }
  }
  return bars;
}

/** The viewfinder: an outlined rounded square filling its cell, and a dot at its centre. */
export function logoFinder(): { x: number; y: number; side: number; cx: number; cy: number } {
  const { x, y } = cellOrigin(LOGO.finder.row, LOGO.finder.col);
  const inset = LOGO.finder.stroke / 2;
  return { x: x + inset, y: y + inset, side: CELL - LOGO.finder.stroke, cx: x + CELL / 2, cy: y + CELL / 2 };
}

const n = (v: number): number => Number(v.toFixed(3));

/** The mark as standalone SVG markup (the content of public/favicon.svg). */
export function logoSvg(): string {
  const { colors, size, tileRadius, barRadius, finder: f } = LOGO;
  const fin = logoFinder();
  const bars = logoBars()
    .map((b) => `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(b.height)}" rx="${barRadius}"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<title>TexScan</title>` +
    `<rect width="${size}" height="${size}" rx="${tileRadius}" fill="${colors.tile}"/>` +
    `<g fill="${colors.bar}">${bars}</g>` +
    `<rect x="${n(fin.x)}" y="${n(fin.y)}" width="${n(fin.side)}" height="${n(fin.side)}" rx="${f.radius}" fill="none" stroke="${colors.accent}" stroke-width="${f.stroke}"/>` +
    `<circle cx="${n(fin.cx)}" cy="${n(fin.cy)}" r="${f.dot}" fill="${colors.accent}"/>` +
    `</svg>\n`
  );
}
