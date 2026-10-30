import { describe, expect, it } from "vitest";
import { classifyPixels, DIFF_COLORS } from "./diffMap";

describe("classifyPixels", () => {
  const pred = [255, 255, 0, 0, 255];
  const gt = [255, 0, 255, 0, 255];

  it("counts true / false positives and negatives", () => {
    expect(classifyPixels(pred, gt).counts).toEqual({ tp: 2, fp: 1, fn: 1, tn: 1 });
  });

  it("colours agreement transparent and each kind of disagreement differently", () => {
    const { rgba } = classifyPixels(pred, gt);
    const px = (i: number) => [...rgba.slice(i * 4, i * 4 + 4)];
    expect(px(0).slice(0, 3)).toEqual([...DIFF_COLORS.tp]);
    expect(px(1).slice(0, 3)).toEqual([...DIFF_COLORS.fp]);
    expect(px(2).slice(0, 3)).toEqual([...DIFF_COLORS.fn]);
    expect(px(3)[3]).toBe(0);
    expect(px(0)[3]).toBeGreaterThan(0);
  });

  it("uses a threshold, so anti-aliased greys do not count as defect", () => {
    expect(classifyPixels([100, 200], [0, 255]).counts).toEqual({ tp: 1, fp: 0, fn: 0, tn: 1 });
    expect(classifyPixels([100, 200], [0, 255], 50).counts).toEqual({ tp: 1, fp: 1, fn: 0, tn: 0 });
  });

  it("derives the same IoU and Dice as the server's definitions", () => {
    const { counts } = classifyPixels(pred, gt);
    expect(counts.tp / (counts.tp + counts.fp + counts.fn)).toBeCloseTo(2 / 4); // IoU
    expect((2 * counts.tp) / (2 * counts.tp + counts.fp + counts.fn)).toBeCloseTo(4 / 6); // Dice = F1
  });

  it("rejects masks of different sizes", () => {
    expect(() => classifyPixels([0, 0], [0])).toThrow("same size");
  });
});
