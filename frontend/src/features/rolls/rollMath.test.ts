import { describe, expect, it } from "vitest";
import { axisTicks, coverageBars, layoutMarkers, lengthToMetres, nextPosition, parsePositive, pointsColor, spacedPositions, verdictOf, widthToMm } from "./rollMath";

describe("unit parsing", () => {
  it("accepts a decimal comma and rejects non-positive input", () => {
    expect(parsePositive("2,5")).toBe(2.5);
    for (const bad of ["", "abc", "0", "-1"]) expect(parsePositive(bad)).toBeNull();
  });

  it("converts length to metres and width to millimetres", () => {
    expect(lengthToMetres("100", "m")).toBe(100);
    expect(lengthToMetres("100", "yd")).toBeCloseTo(91.44);
    expect(widthToMm("150", "cm")).toBe(1500);
    expect(widthToMm("60", "in")).toBeCloseTo(1524);
    expect(widthToMm("1500", "mm")).toBe(1500);
    expect(widthToMm("x", "mm")).toBeNull();
  });
});

describe("pointsColor", () => {
  it("clamps to the four steps", () => {
    expect(pointsColor(0)).toBe(pointsColor(1));
    expect(pointsColor(9)).toBe(pointsColor(4));
    expect(new Set([1, 2, 3, 4].map(pointsColor)).size).toBe(4);
  });
});

describe("layoutMarkers", () => {
  it("positions as a share of the roll length", () => {
    const [a, b] = layoutMarkers([{ key: "a", position_m: 25 }, { key: "b", position_m: 100 }], 100);
    expect(a).toMatchObject({ key: "a", top: 25 });
    expect(b!.top).toBe(100);
  });

  it("moves markers that would sit on top of each other into other lanes", () => {
    const lanes = layoutMarkers([{ key: "a", position_m: 10 }, { key: "b", position_m: 10.2 }, { key: "c", position_m: 10.4 }, { key: "d", position_m: 50 }], 100);
    expect(lanes.map((m) => m.lane)).toEqual([0, 1, 2, 0]);
  });

  it("copes with more crowded markers than lanes and with a zero-length roll", () => {
    const crowd = layoutMarkers(Array.from({ length: 7 }, (_, i) => ({ key: String(i), position_m: 10 + i * 0.01 })), 100, 1.8, 4);
    expect(crowd).toHaveLength(7);
    expect(crowd.every((m) => m.lane >= 0 && m.lane < 4)).toBe(true);
    expect(layoutMarkers([{ key: "x", position_m: 5 }], 0)[0]!.top).toBe(0);
  });

  it("sorts by position and keeps going past the ends", () => {
    const out = layoutMarkers([{ key: "late", position_m: 120 }, { key: "early", position_m: -3 }], 100);
    expect(out.map((m) => [m.key, m.top])).toEqual([["early", 0], ["late", 100]]);
  });
});

describe("coverage and positions", () => {
  it("draws the covered stretches within the roll", () => {
    expect(coverageBars([{ start_m: 10, covered_m: 5 }, { start_m: 98, covered_m: 5 }, { start_m: 200, covered_m: 1 }], 100)).toEqual([
      { top: 10, height: 5 },
      { top: 98, height: 2 },
    ]);
  });

  it("suggests the end of the furthest capture, never beyond the roll", () => {
    expect(nextPosition([], 50)).toBe(0);
    expect(nextPosition([{ start_m: 0, covered_m: 0.24 }, { start_m: 5, covered_m: 0.24 }], 50)).toBe(5.24);
    expect(nextPosition([{ start_m: 49.9, covered_m: 1 }], 50)).toBe(50);
  });

  it("spaces marks evenly and clamps them to the roll", () => {
    expect(spacedPositions(1, 0.5, 4, 10)).toEqual([1, 1.5, 2, 2.5]);
    expect(spacedPositions(9, 1, 3, 10)).toEqual([9, 10, 10]);
    expect(spacedPositions(0, 0.1, 3, 10)).toEqual([0, 0.1, 0.2]);
  });
});

describe("axisTicks", () => {
  it("uses a round step with about ten ticks or fewer", () => {
    expect(axisTicks(100)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(axisTicks(2)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(axisTicks(0)).toEqual([0]);
    expect(axisTicks(37).at(-1)).toBeLessThanOrEqual(37);
    expect(axisTicks(1234).length).toBeLessThanOrEqual(12);
  });
});

describe("verdictOf", () => {
  it("is neutral until something is captured", () => {
    expect(verdictOf({ capture_count: 0, accepted: true })).toEqual({ label: "Not inspected", tone: "neutral" });
    expect(verdictOf({ capture_count: 2, accepted: true })).toEqual({ label: "Accept", tone: "pass" });
    expect(verdictOf({ capture_count: 2, accepted: false })).toEqual({ label: "Reject", tone: "fail" });
  });
});
