import { describe, expect, it } from "vitest";
import type { BenchmarkOut, CategoryMetrics } from "@/api/types";
import { bestPerColumn, buildGrid, formatValue, intensity, METRICS } from "./heatmap";

const m = (f1: number, seconds = 1, iou: number | null = null): CategoryMetrics => ({
  accuracy: 0.5, precision: 0.5, recall: 0.5, f1, tp: 1, fp: 1, tn: 1, fn: 1, pixel_iou: iou, pixel_dice: iou, n_images: 4, n_defective: 2, errors: [], seconds_per_image: seconds,
}); // fmt: skip

const results: BenchmarkOut["results"] = {
  local_statistics: { carpet: m(0.4, 0.1), wood: m(0.9, 0.2, 0.3) },
  fft: { carpet: m(0.8, 0.5, 0.6), wood: m(0.9, 0.6, 0.5), tile: m(0.2, 0.4) },
  gabor: { carpet: m(0.8, 2) },
};
const metric = (key: string) => METRICS.find((x) => x.key === key)!;

describe("buildGrid", () => {
  const grid = buildGrid(results, "f1");

  it("orders methods and categories consistently and fills gaps with null", () => {
    expect(grid.methods).toEqual(["fft", "gabor", "local_statistics"]);
    expect(grid.categories).toEqual(["carpet", "tile", "wood"]);
    expect(grid.cells[1]!.map((c) => c.value)).toEqual([0.8, null, null]); // gabor has no tile / wood
  });

  it("averages only the categories that have a value", () => {
    expect(grid.means[0]).toBeCloseTo((0.8 + 0.2 + 0.9) / 3);
    expect(grid.means[1]).toBeCloseTo(0.8);
  });

  it("treats a missing pixel metric as n/a, not zero", () => {
    const g = buildGrid(results, "pixel_iou");
    expect(g.cells[0]!.map((c) => c.value)).toEqual([0.6, null, 0.5]);
    expect(g.means[0]).toBeCloseTo(0.55);
    expect(g.means[1]).toBeNull();
  });

  it("handles an empty result set", () => {
    const g = buildGrid({}, "f1");
    expect(g.methods).toEqual([]);
    expect(g.max).toBe(1);
  });
});

describe("intensity", () => {
  it("is the value itself for scores and clamps to [0, 1]", () => {
    expect(intensity(0.7, metric("f1"), 1)).toBe(0.7);
    expect(intensity(1.4, metric("f1"), 1)).toBe(1);
    expect(intensity(null, metric("f1"), 1)).toBe(0);
  });

  it("flips time so that faster is darker", () => {
    expect(intensity(0, metric("seconds_per_image"), 2)).toBe(1);
    expect(intensity(2, metric("seconds_per_image"), 2)).toBe(0);
    expect(intensity(0.5, metric("seconds_per_image"), 2)).toBeCloseTo(0.75);
  });
});

describe("bestPerColumn", () => {
  it("marks the best method per category, including ties", () => {
    const best = bestPerColumn(buildGrid(results, "f1"), metric("f1"));
    expect(best.has("fft|carpet") && best.has("gabor|carpet")).toBe(true); // 0.8 tie
    expect(best.has("local_statistics|carpet")).toBe(false);
    expect(best.has("fft|wood") && best.has("local_statistics|wood")).toBe(true);
    expect(best.has("fft|tile")).toBe(false); // alone in its column: nothing to beat
  });

  it("prefers the lowest value when lower is better", () => {
    const best = bestPerColumn(buildGrid(results, "seconds_per_image"), metric("seconds_per_image"));
    expect(best.has("local_statistics|carpet")).toBe(true);
    expect(best.has("gabor|carpet")).toBe(false);
  });
});

describe("formatValue", () => {
  it("formats scores, times and missing values", () => {
    expect(formatValue(0.456, metric("f1"))).toBe("0.46");
    expect(formatValue(1.234, metric("seconds_per_image"))).toBe("1.23");
    expect(formatValue(12.34, metric("seconds_per_image"))).toBe("12.3");
    expect(formatValue(null, metric("f1"))).toBe("n/a");
  });
});
