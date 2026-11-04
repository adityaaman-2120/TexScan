import type { Method } from "@/api/types";
import { DEFAULT_VALUES, getPath, sliderDefs, type Overrides } from "./config";

export type Sensitivity = "low" | "medium" | "high";

export const SENSITIVITIES: { value: Sensitivity; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "Only clear defects. Fewest false alarms." },
  { value: "medium", label: "Medium", hint: "Balanced. Recommended." },
  { value: "high", label: "High", hint: "Also small and faint defects. More false alarms." },
];

export const DEFAULT_SENSITIVITY: Sensitivity = "medium";

/** How far each preset moves the detection threshold and the smallest region that counts, relative to the baseline. */
const FACTORS: Record<Sensitivity, { threshold: number; minArea: number }> = {
  low: { threshold: 1.5, minArea: 2 },
  medium: { threshold: 1, minArea: 1 },
  high: { threshold: 0.7, minArea: 0.5 },
};

const MIN_AREA_PATH = "morphology.min_area";
const COLOUR_PATH = "colour.k";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Config overrides for a sensitivity preset: the detection threshold is scaled and so is the minimum defect size.
 * The baseline is what the active profile learned (or the defaults without one), so a calibrated profile keeps its meaning:
 * Medium changes nothing, Low / High move away from it by a fixed factor.
 */
export function sensitivityOverrides(level: Sensitivity, method: Method, baseConfig: unknown): Overrides {
  if (level === "medium") return {};
  const factor = FACTORS[level];
  const defs = sliderDefs(method);
  const threshold = defs.find((d) => d.label === "Threshold");
  const minArea = defs.find((d) => d.path === MIN_AREA_PATH);
  const colour = defs.find((d) => d.path === COLOUR_PATH); // the colour check moves with the same preset, so stains are as sensitive as texture
  const base = (path: string): number => Number(getPath(baseConfig, path) ?? DEFAULT_VALUES[path] ?? 0);

  const out: Overrides = {};
  if (threshold) out[threshold.path] = round1(clamp(base(threshold.path) * factor.threshold, threshold.min, threshold.max));
  if (colour) out[colour.path] = round1(clamp(base(colour.path) * factor.threshold, colour.min, colour.max));
  if (minArea) out[minArea.path] = Math.round(clamp(base(minArea.path) * factor.minArea, minArea.min, minArea.max));
  return out;
}
