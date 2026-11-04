import { describe, expect, it } from "vitest";
import { sensitivityOverrides } from "./sensitivity";

describe("sensitivityOverrides", () => {
  it("leaves the baseline untouched at Medium", () => {
    expect(sensitivityOverrides("medium", "gabor", undefined)).toEqual({});
  });

  it("raises the threshold and the minimum size at Low, from the defaults", () => {
    expect(sensitivityOverrides("low", "gabor", undefined)).toEqual({ "gabor.k": 15, "colour.k": 9, "morphology.min_area": 100 });
  });

  it("lowers the threshold and the minimum size at High, from the defaults", () => {
    expect(sensitivityOverrides("high", "gabor", undefined)).toEqual({ "gabor.k": 7, "colour.k": 4.2, "morphology.min_area": 25 });
  });

  it("scales what the profile learned, not the defaults", () => {
    const profile = { gabor: { k: 20 }, morphology: { min_area: 400 } };
    expect(sensitivityOverrides("high", "gabor", profile)).toEqual({ "gabor.k": 14, "colour.k": 4.2, "morphology.min_area": 200 });
    expect(sensitivityOverrides("low", "gabor", profile)).toEqual({ "gabor.k": 20, "colour.k": 9, "morphology.min_area": 800 }); // threshold capped at the slider maximum
  });

  it("uses the threshold that belongs to the method", () => {
    expect(Object.keys(sensitivityOverrides("high", "local_statistics", undefined))).toContain("local_stats.k");
    expect(Object.keys(sensitivityOverrides("high", "fft", undefined))).toContain("threshold.min_threshold");
  });

  it("is ordered: High is never less sensitive than Low", () => {
    const low = sensitivityOverrides("low", "gabor", undefined);
    const high = sensitivityOverrides("high", "gabor", undefined);
    expect(Number(high["gabor.k"])).toBeLessThan(Number(low["gabor.k"]));
    expect(Number(high["morphology.min_area"])).toBeLessThan(Number(low["morphology.min_area"]));
  });
});
