import { describe, expect, it } from "vitest";
import type { InspectionOut } from "@/api/types";
import { heatColor } from "./imageFx";
import { SAMPLES } from "./samples";
import { heatKey, residualKey, stageInfo } from "./stageInfo";

type Config = InspectionOut["config"];

const config = (over: Record<string, unknown> = {}): Config =>
  ({
    method: "fft",
    max_side: 1024,
    denoise: { method: "median", ksize: 5 },
    enhance: { method: "clahe", clip_limit: 2, tile_grid: 8 },
    threshold: { min_threshold: 12 },
    morphology: { min_area: 50 },
    gabor: { k: 10 },
    local_stats: { window: 31, k: 4 },
    ...over,
  }) as unknown as Config;

/** every stage name any detector can put in stage_urls (see backend/texscan/pipeline/detectors.py and the runner) */
const ALL_STAGES = [
  "upload", "original", "gray", "denoised", "enhanced",
  "spectrum", "spectrum_peaks", "notch_mask", "residual", "residual_abs",
  "gabor_energy", "anomaly_score",
  "aligned_reference", "difference",
  "local_mean", "local_variance",
  "mask_raw", "mask_clean", "overlay",
]; // fmt: skip

describe("stageInfo", () => {
  it("explains every stage the backend can produce", () => {
    for (const name of ALL_STAGES) {
      const info = stageInfo(name, config());
      expect(info.title, name).not.toBe(name.replace(/_/g, " ")); // not the generic fallback
      expect(info.explain.length, name).toBeGreaterThan(20);
      expect(info.formula, name).not.toBe("—");
    }
  });

  it("falls back gracefully for an unknown stage", () => {
    expect(stageInfo("brand_new_stage", config()).title).toBe("brand new stage");
  });

  it("specialises the text with the settings the run used", () => {
    expect(stageInfo("denoised", config({ denoise: { method: "median", ksize: 9 } })).explain).toContain("9×9");
    expect(stageInfo("denoised", config({ denoise: { method: "gaussian", ksize: 7 } })).formula).toContain("G_σ");
    expect(stageInfo("denoised", config({ denoise: { method: "none", ksize: 5 } })).explain).toContain("off");
    expect(stageInfo("enhanced", config({ enhance: { method: "hist_eq" } })).formula).toContain("CDF");
    expect(stageInfo("mask_clean", config({ morphology: { min_area: 321 } })).explain).toContain("321");
    expect(stageInfo("original", config({ max_side: 512 })).explain).toContain("512");
  });

  it("describes the raw mask according to the method", () => {
    expect(stageInfo("mask_raw", config()).formula).toContain("T_otsu");
    expect(stageInfo("mask_raw", config({ method: "gabor" })).formula).toContain("MAD");
    expect(stageInfo("mask_raw", config({ method: "local_statistics" })).explain).toContain("31×31");
  });

  it("maps stages to the timing keys the backend reports", () => {
    expect(stageInfo("denoised", config()).timing).toBe("denoise");
    expect(stageInfo("spectrum", config()).timing).toBe("fft_spectrum");
    expect(stageInfo("anomaly_score", config({ method: "gabor" })).timing).toBe("gabor_score");
    expect(stageInfo("anomaly_score", config({ method: "local_statistics" })).timing).toBe("local_stats_score");
    expect(stageInfo("upload", config()).timing).toBeUndefined();
  });
});

describe("stage picking", () => {
  it("chooses the residual and heatmap sources per method", () => {
    expect(residualKey({ residual: "a", residual_abs: "b" })).toBe("residual");
    expect(residualKey({ difference: "a", residual_abs: "b" })).toBe("difference");
    expect(residualKey({ anomaly_score: "a" })).toBe("anomaly_score");
    expect(residualKey({ original: "a" })).toBeUndefined();
    expect(heatKey({ residual_abs: "a", anomaly_score: "b" })).toBe("residual_abs");
    expect(heatKey({ anomaly_score: "b" })).toBe("anomaly_score");
    expect(heatKey({ original: "a" })).toBeUndefined();
  });
});

describe("heatColor", () => {
  it("is transparent at zero and opaque red at one", () => {
    expect(heatColor(0)[3]).toBe(0);
    expect(heatColor(1)).toEqual([239, 68, 68, 255]);
  });

  it("gets more opaque as the score rises", () => {
    const alphas = [0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => heatColor(v)[3]);
    expect([...alphas].sort((a, b) => a - b)).toEqual(alphas);
  });
});

describe("samples", () => {
  it("has unique ids, valid methods and a reference for each", () => {
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(SAMPLES.length);
    SAMPLES.forEach((s) => {
      expect(["fft", "gabor", "golden_template", "local_statistics"]).toContain(s.method);
      expect(s.url).toBe(`/samples/${s.id}.png`);
      expect(s.mask).toBe(`/samples/${s.id}.mask.png`);
      expect(s.reference).toMatch(/^\/samples\/ref-.+\.png$/);
    });
    expect(SAMPLES.some((s) => !s.defective)).toBe(true);
    expect(SAMPLES.some((s) => s.defective)).toBe(true);
  });
});
