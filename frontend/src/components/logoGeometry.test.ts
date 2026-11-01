import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BAR, CELL, GAP, LOGO, SEAM, cellOrigin, isFinder, logoBars, logoFinder, logoSvg, lyingAcross } from "./logoGeometry";

describe("logo geometry", () => {
  it("fills the pattern exactly: 4 cells and 3 gaps, 2 bars and 1 seam per cell", () => {
    expect(4 * CELL + 3 * GAP).toBeCloseTo(LOGO.patternSize);
    expect(2 * BAR + SEAM).toBeCloseTo(CELL);
  });

  it("centres the pattern on the tile", () => {
    expect(LOGO.origin * 2 + LOGO.patternSize).toBe(LOGO.size);
  });

  it("has 15 woven cells of two bars each, and one viewfinder cell", () => {
    expect(logoBars()).toHaveLength(30);
    const cells = Array.from({ length: 16 }, (_, i) => [Math.floor(i / 4), i % 4] as const);
    expect(cells.filter(([r, c]) => isFinder(r, c))).toEqual([[1, 2]]);
  });

  it("alternates across and upright like a checkerboard", () => {
    expect([0, 1, 2, 3].map((c) => lyingAcross(0, c))).toEqual([true, false, true, false]);
    expect([0, 1, 2, 3].map((c) => lyingAcross(1, c))).toEqual([false, true, false, true]);
    // the viewfinder takes the place of an upright cell, as in the reference mark
    expect(lyingAcross(LOGO.finder.row, LOGO.finder.col)).toBe(false);
  });

  it("draws lying bars wide and upright bars tall, and keeps every bar inside the pattern", () => {
    for (const b of logoBars()) {
      expect(b.width === CELL ? b.height : b.width).toBeCloseTo(BAR);
      expect(b.x).toBeGreaterThanOrEqual(LOGO.origin - 1e-9);
      expect(b.y).toBeGreaterThanOrEqual(LOGO.origin - 1e-9);
      expect(b.x + b.width).toBeLessThanOrEqual(LOGO.origin + LOGO.patternSize + 1e-9);
      expect(b.y + b.height).toBeLessThanOrEqual(LOGO.origin + LOGO.patternSize + 1e-9);
    }
  });

  it("never overlaps two bars", () => {
    const bars = logoBars();
    for (let i = 0; i < bars.length; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        const a = bars[i]!;
        const b = bars[j]!;
        const overlap = a.x < b.x + b.width - 1e-9 && b.x < a.x + a.width - 1e-9 && a.y < b.y + b.height - 1e-9 && b.y < a.y + a.height - 1e-9;
        expect(overlap, `${i} and ${j}`).toBe(false);
      }
    }
  });

  it("puts the viewfinder inside its cell with the dot at the centre", () => {
    const f = logoFinder();
    const o = cellOrigin(LOGO.finder.row, LOGO.finder.col);
    expect(f.x).toBeGreaterThanOrEqual(o.x);
    expect(f.x + f.side).toBeLessThanOrEqual(o.x + CELL + 1e-9);
    expect([f.cx, f.cy]).toEqual([o.x + CELL / 2, o.y + CELL / 2]);
  });
});

describe("public/favicon.svg", () => {
  it("is exactly the mark this code draws, so the browser tab and the app agree", () => {
    expect(readFileSync(new URL("../../public/favicon.svg", import.meta.url), "utf8")).toBe(logoSvg());
  });
});
