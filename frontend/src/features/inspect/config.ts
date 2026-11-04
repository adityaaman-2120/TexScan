import type { InspectionOut, Method } from "@/api/types";

/** Slider / select edits, keyed by dotted PipelineConfig path, e.g. "threshold.min_threshold". */
export type Overrides = Record<string, number | string>;

export interface SliderDef {
  path: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

/** Mirror of the backend PipelineConfig defaults for the paths the panel edits (used before the first result). */
export const DEFAULT_VALUES: Record<string, number | string> = {
  "denoise.method": "median",
  "denoise.ksize": 5,
  "enhance.method": "clahe",
  "threshold.min_threshold": 12,
  "gabor.k": 10,
  "local_stats.k": 4,
  "local_stats.window": 31,
  "colour.k": 6,
  "morphology.min_area": 50,
  "morphology.kernel_size": 3,
  "notch.sigma": 3,
  center_fraction: 1,
};

/** Controls shown in the Advanced accordion; the threshold control depends on the method. */
export function sliderDefs(method: Method): SliderDef[] {
  const threshold: SliderDef =
    method === "gabor"
      ? { path: "gabor.k", label: "Threshold", hint: "Robust deviations (MAD) above the typical energy", min: 3, max: 20, step: 0.5 }
      : method === "local_statistics"
        ? { path: "local_stats.k", label: "Threshold", hint: "Robust deviations (MAD) of window mean / variance", min: 2, max: 12, step: 0.5 }
        : { path: "threshold.min_threshold", label: "Threshold", hint: "Lowest residual (gray levels) that counts as defect", min: 1, max: 60, step: 0.5, unit: "gl" };

  return [
    { path: "denoise.ksize", label: "Denoise kernel", hint: "Window of the median / Gaussian filter (odd)", min: 1, max: 15, step: 2, unit: "px" },
    threshold,
    ...(method === "golden_template"
      ? []
      : [{ path: "colour.k", label: "Colour threshold", hint: "How far a colour must differ from the cloth around it (robust deviations). Lower finds fainter stains", min: 3, max: 30, step: 0.5 } satisfies SliderDef]),
    { path: "center_fraction", label: "Inspect area", hint: "Middle part of the picture that is judged (1 = all). Lower it to skip the edge of the cloth", min: 0.3, max: 1, step: 0.1 },
    { path: "morphology.min_area", label: "Min area", hint: "Smaller regions are discarded", min: 1, max: 2000, step: 1, unit: "px" },
    { path: "morphology.kernel_size", label: "Cleanup kernel", hint: "Opening / closing structuring element (odd)", min: 1, max: 11, step: 2, unit: "px" },
    ...(method === "fft"
      ? [{ path: "notch.sigma", label: "Notch radius", hint: "Gaussian sigma of each rejected spectral peak", min: 1, max: 12, step: 0.5, unit: "px" } satisfies SliderDef]
      : []),
    ...(method === "local_statistics"
      ? [{ path: "local_stats.window", label: "Window", hint: "Sliding-window size (odd)", min: 5, max: 101, step: 2, unit: "px" } satisfies SliderDef]
      : []),
  ];
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[key] : undefined), obj);
}

/** {"a.b": 1, "a.c": 2} -> {a: {b: 1, c: 2}}, the shape the API's `config` field expects. */
export function toConfig(overrides: Overrides): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(overrides)) {
    const keys = path.split(".");
    let node = out;
    keys.slice(0, -1).forEach((key) => {
      node = (node[key] ??= {}) as Record<string, unknown>;
    });
    node[keys[keys.length - 1]!] = value;
  }
  return out;
}

/** Value shown by a control: the user's edit, else what the last run actually used, else the default. */
export function effectiveValue(path: string, overrides: Overrides, config: InspectionOut["config"] | undefined): number | string {
  return overrides[path] ?? ((getPath(config, path) as number | string | undefined) ?? DEFAULT_VALUES[path] ?? 0);
}

/** Median / Gaussian kernels must be odd; snap an arbitrary slider value. */
export const toOdd = (v: number): number => (Math.round(v) % 2 === 0 ? Math.round(v) + 1 : Math.round(v));
