import { describe, expect, it } from "vitest";
import { clickToImage, nextPoints, pixelDistance, pixelsPerMm, toMm } from "./rulerMath";

describe("toMm", () => {
  it("converts units and accepts a decimal comma", () => {
    expect(toMm("200", "mm")).toBe(200);
    expect(toMm("15", "cm")).toBe(150);
    expect(toMm("12", "in")).toBeCloseTo(304.8);
    expect(toMm("2,5", "cm")).toBe(25);
  });

  it("rejects anything that is not a positive number", () => {
    for (const bad of ["", "abc", "0", "-3"]) expect(toMm(bad, "mm")).toBeNull();
  });
});

describe("clickToImage", () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 };

  it("scales a click on a shrunken picture back to full-size pixels", () => {
    expect(clickToImage(300, 200, rect, 2000, 1500)).toEqual({ x: 1000, y: 750 });
    expect(clickToImage(100, 50, rect, 2000, 1500)).toEqual({ x: 0, y: 0 });
  });

  it("clamps a click that lands just outside the picture", () => {
    expect(clickToImage(900, -20, rect, 2000, 1500)).toEqual({ x: 2000, y: 0 });
  });
});

describe("distances", () => {
  it("measures pixels and derives pixels per millimetre", () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500);
    expect(pixelsPerMm([{ x: 0, y: 0 }, { x: 300, y: 400 }], 250)).toBe(2);
    expect(pixelsPerMm([{ x: 0, y: 0 }], 250)).toBeNull();
    expect(pixelsPerMm([{ x: 0, y: 0 }, { x: 5, y: 5 }], null)).toBeNull();
    expect(pixelsPerMm([{ x: 3, y: 3 }, { x: 3, y: 3 }], 10)).toBeNull();
  });
});

describe("nextPoints", () => {
  it("fills two points then starts over", () => {
    const a = { x: 1, y: 1 };
    const b = { x: 2, y: 2 };
    const c = { x: 3, y: 3 };
    expect(nextPoints([], a)).toEqual([a]);
    expect(nextPoints([a], b)).toEqual([a, b]);
    expect(nextPoints([a, b], c)).toEqual([c]);
  });
});
