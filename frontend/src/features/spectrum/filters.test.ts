import { describe, expect, it } from "vitest";
import { canvasPoint, centre, cutoffPx, mirrorCanvas, mirrorIndex, pairPeaks, radialGain } from "./filters";

const lp = (response: "ideal" | "butterworth" | "gaussian", order = 2) => ({ kind: "lowpass" as const, response, order });

describe("radialGain (must match the backend's radial_filter)", () => {
  it("passes the DC bin of a low-pass and blocks it for a high-pass", () => {
    for (const response of ["ideal", "butterworth", "gaussian"] as const) {
      expect(radialGain(lp(response), 20, 0)).toBeCloseTo(1);
      expect(radialGain({ kind: "highpass", response, order: 2 }, 20, 0)).toBeCloseTo(0);
    }
  });

  it("has the textbook value at the cutoff", () => {
    expect(radialGain(lp("ideal"), 20, 20)).toBe(1);
    expect(radialGain(lp("ideal"), 20, 20.5)).toBe(0);
    expect(radialGain(lp("butterworth", 3), 20, 20)).toBeCloseTo(0.5);
    expect(radialGain(lp("gaussian"), 20, 20)).toBeCloseTo(Math.exp(-0.5));
  });

  it("makes the Butterworth transition steeper with a higher order", () => {
    expect(radialGain(lp("butterworth", 8), 20, 30)).toBeLessThan(radialGain(lp("butterworth", 1), 20, 30));
    expect(radialGain(lp("butterworth", 8), 20, 12)).toBeGreaterThan(radialGain(lp("butterworth", 1), 20, 12));
  });

  it("high-pass is the complement of low-pass and sharpen never attenuates", () => {
    for (const d of [0, 5, 20, 40, 90]) {
      const low = radialGain(lp("gaussian"), 20, d);
      expect(radialGain({ kind: "highpass", response: "gaussian", order: 2 }, 20, d)).toBeCloseTo(1 - low);
      expect(radialGain({ kind: "sharpen", response: "gaussian", order: 2 }, 20, d, 2)).toBeCloseTo(1 + 2 * (1 - low));
      expect(radialGain({ kind: "sharpen", response: "gaussian", order: 2 }, 20, d)).toBeGreaterThanOrEqual(1);
    }
  });

  it("is the identity when no preset is selected", () => {
    expect(radialGain({ kind: "none", response: "ideal", order: 2 }, 5, 100)).toBe(1);
  });

  it("converts a fractional cutoff to pixels", () => {
    expect(cutoffPx(0.5, 512)).toBe(128);
    expect(cutoffPx(0, 512)).toBe(1);
  });
});

describe("mirror geometry (backend uses index -> 2*(N//2) - index)", () => {
  it("mirrors indices through the DC bin", () => {
    expect(centre(512, 512)).toEqual({ x: 256, y: 256 });
    expect(mirrorIndex({ x: 272, y: 256 }, 512, 512)).toEqual({ x: 240, y: 256 });
    expect(mirrorIndex({ x: 256, y: 256 }, 512, 512)).toEqual({ x: 256, y: 256 });
  });

  it("canvas mirror of a pixel centre is the mirror pixel's centre", () => {
    const p = mirrorIndex({ x: 272, y: 250 }, 512, 512);
    const m = mirrorCanvas({ x: 272.5, y: 250.5 }, 512, 512);
    expect(m).toEqual({ x: p.x + 0.5, y: p.y + 0.5 });
  });

  it("works for odd sizes", () => {
    expect(mirrorIndex({ x: 20, y: 10 }, 31, 33)).toEqual({ x: 2 * 15 - 20, y: 2 * 16 - 10 });
  });
});

describe("pairPeaks", () => {
  const peaks = (list: [number, number][]) => list.map(([x, y]) => ({ row: y, col: x, x, y }));

  it("groups a peak with its mirror image and reports its period", () => {
    const pairs = pairPeaks(peaks([[272, 256], [240, 256], [256, 272], [256, 240]]), 512, 512);
    expect(pairs).toHaveLength(2);
    const horizontal = pairs.find((p) => p.dy === 0)!;
    expect(Math.abs(horizontal.dx)).toBe(16);
    expect(horizontal.period).toBeCloseTo(512 / 16);
    expect(horizontal.b).toEqual(mirrorIndex(horizontal.a, 512, 512));
  });

  it("keeps a lone peak (its mirror was beyond the detection cap) as a pair", () => {
    const pairs = pairPeaks(peaks([[300, 200]]), 512, 512);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.b).toEqual({ x: 212, y: 312 });
  });

  it("gives the same id whichever half is listed first", () => {
    const a = pairPeaks(peaks([[272, 256], [240, 256]]), 512, 512)[0]!;
    const b = pairPeaks(peaks([[240, 256], [272, 256]]), 512, 512)[0]!;
    expect(a.id).toBe(b.id);
  });

  it("returns nothing for no peaks", () => {
    expect(pairPeaks([], 512, 512)).toEqual([]);
  });
});

describe("canvasPoint", () => {
  it("maps a scaled display back to canvas pixels", () => {
    const rect = { left: 100, top: 50, width: 256, height: 256 }; // 512 px canvas shown at half size
    expect(canvasPoint(100 + 128, 50 + 64, rect, 512, 512)).toEqual({ x: 256, y: 128 });
  });
});
