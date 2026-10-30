import { describe, expect, it } from "vitest";
import { defectSlices, formatMs, formatPercent, mostCommon } from "./defectColors";

describe("defectSlices", () => {
  it("returns present types in the fixed order, not by count", () => {
    expect(defectSlices({ stain: 9, hole: 2 })).toEqual([{ type: "hole", count: 2 }, { type: "stain", count: 9 }]);
  });

  it("drops types with no defects and handles an empty record", () => {
    expect(defectSlices({ hole: 0, stain: 1 })).toEqual([{ type: "stain", count: 1 }]);
    expect(defectSlices({})).toEqual([]);
  });

  it("folds types this client does not know into unknown", () => {
    expect(defectSlices({ unknown: 1, scorch: 4 })).toEqual([{ type: "unknown", count: 5 }]);
  });
});

describe("mostCommon", () => {
  it("picks the biggest slice", () => {
    expect(mostCommon(defectSlices({ hole: 2, tear_line: 7, stain: 3 }))).toEqual({ type: "tear_line", count: 7 });
  });

  it("prefers a classified type over a bigger unknown, but falls back to unknown", () => {
    expect(mostCommon(defectSlices({ unknown: 500, stain: 3 }))).toEqual({ type: "stain", count: 3 });
    expect(mostCommon(defectSlices({ unknown: 5 }))).toEqual({ type: "unknown", count: 5 });
  });

  it("is undefined without defects", () => {
    expect(mostCommon([])).toBeUndefined();
  });
});

describe("formatMs", () => {
  it("uses milliseconds under a second and seconds above", () => {
    expect(formatMs(812.4)).toBe("812 ms");
    expect(formatMs(1234)).toBe("1.23 s");
    expect(formatMs(null)).toBe("—");
    expect(formatMs(undefined)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("rounds, and never shows a present share as 0%", () => {
    expect(formatPercent(53, 100)).toBe("53%");
    expect(formatPercent(1, 2768)).toBe("<1%");
    expect(formatPercent(0, 10)).toBe("0%");
    expect(formatPercent(0, 0)).toBe("0%");
  });
});
