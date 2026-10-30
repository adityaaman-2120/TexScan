import { describe, expect, it } from "vitest";
import type { InspectionOut } from "@/api/types";
import { DEFAULT_VALUES, effectiveValue, getPath, sliderDefs, toConfig, toOdd } from "./config";

describe("toConfig", () => {
  it("turns dotted paths into the nested object the API expects", () => {
    expect(toConfig({ "threshold.min_threshold": 20, "morphology.min_area": 120, "morphology.kernel_size": 5, "denoise.method": "gaussian" })).toEqual({
      threshold: { min_threshold: 20 },
      morphology: { min_area: 120, kernel_size: 5 },
      denoise: { method: "gaussian" },
    });
  });

  it("is empty when nothing was edited", () => {
    expect(toConfig({})).toEqual({});
  });
});

describe("sliderDefs", () => {
  const paths = (m: Parameters<typeof sliderDefs>[0]) => sliderDefs(m).map((d) => d.path);

  it("uses the right threshold for each method", () => {
    expect(paths("fft")).toContain("threshold.min_threshold");
    expect(paths("golden_template")).toContain("threshold.min_threshold");
    expect(paths("gabor")).toContain("gabor.k");
    expect(paths("local_statistics")).toContain("local_stats.k");
  });

  it("offers the notch radius only for FFT and the window only for local statistics", () => {
    expect(paths("fft")).toContain("notch.sigma");
    expect(paths("gabor")).not.toContain("notch.sigma");
    expect(paths("local_statistics")).toContain("local_stats.window");
    expect(paths("fft")).not.toContain("local_stats.window");
  });

  it("every slider range contains its default", () => {
    (["fft", "gabor", "golden_template", "local_statistics"] as const).forEach((m) =>
      sliderDefs(m).forEach((d) => {
        const def = DEFAULT_VALUES[d.path] as number;
        expect(def).toBeGreaterThanOrEqual(d.min);
        expect(def).toBeLessThanOrEqual(d.max);
      }),
    );
  });
});

describe("effectiveValue", () => {
  const config = { denoise: { ksize: 9 } } as unknown as InspectionOut["config"];

  it("prefers the user's edit, then the last run's config, then the default", () => {
    expect(effectiveValue("denoise.ksize", { "denoise.ksize": 3 }, config)).toBe(3);
    expect(effectiveValue("denoise.ksize", {}, config)).toBe(9);
    expect(effectiveValue("denoise.ksize", {}, undefined)).toBe(5);
  });

  it("getPath tolerates missing branches", () => {
    expect(getPath({ a: { b: 1 } }, "a.b")).toBe(1);
    expect(getPath({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(getPath(undefined, "a")).toBeUndefined();
  });
});

describe("toOdd", () => {
  it("snaps even kernel sizes to the next odd number", () => {
    expect([1, 2, 3, 4, 6].map(toOdd)).toEqual([1, 3, 3, 5, 7]);
  });
});
