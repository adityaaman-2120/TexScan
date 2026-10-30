export type Degradation = "gaussian_noise" | "blur" | "brightness" | "jpeg_quality";

export interface DegradationInfo {
  label: string;
  /** the x-axis title: what the level means */
  axis: string;
  lo: number;
  hi: number;
  decimals: number;
  /** a one-line explanation of the effect */
  help: string;
}

export const DEGRADATIONS: Record<Degradation, DegradationInfo> = {
  gaussian_noise: { label: "Noise", axis: "noise σ (gray levels)", lo: 0, hi: 60, decimals: 0, help: "Random sensor noise added to every pixel." },
  blur: { label: "Blur", axis: "blur σ (px)", lo: 0, hi: 6, decimals: 1, help: "Defocus: a Gaussian blur of growing radius." },
  brightness: { label: "Brightness", axis: "brightness shift (gray levels)", lo: -80, hi: 80, decimals: 0, help: "Exposure change: every pixel brighter or darker by the same amount." },
  jpeg_quality: { label: "JPEG quality", axis: "JPEG quality (100 = best)", lo: 5, hi: 100, decimals: 0, help: "Lossy compression: blocking and ringing at lower quality." },
};

export const DEGRADATION_ORDER: Degradation[] = ["gaussian_noise", "blur", "brightness", "jpeg_quality"];

/** Evenly spaced levels across a degradation's range, rounded and de-duplicated. The API allows at most 12. */
export function levelsFor(kind: Degradation, steps: number): number[] {
  const { lo, hi, decimals } = DEGRADATIONS[kind];
  const n = Math.min(12, Math.max(2, Math.round(steps)));
  const factor = 10 ** decimals;
  const levels = Array.from({ length: n }, (_, i) => Math.round((lo + ((hi - lo) * i) / (n - 1)) * factor) / factor);
  return [...new Set(levels)];
}

export interface DecisionRange {
  decision: "PASS" | "FAIL";
  from: number;
  to: number;
}

/** Consecutive levels with the same verdict, in level order: "PASS from 0 to 10, FAIL from 20 to 60". */
export function decisionRanges(points: { level: number; decision: "PASS" | "FAIL" }[]): DecisionRange[] {
  const sorted = [...points].sort((a, b) => a.level - b.level);
  const ranges: DecisionRange[] = [];
  for (const { level, decision } of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.decision === decision) last.to = level;
    else ranges.push({ decision, from: level, to: level });
  }
  return ranges;
}

export function formatLevel(kind: Degradation, level: number): string {
  const { decimals } = DEGRADATIONS[kind];
  return level.toFixed(decimals);
}

/** One sentence about where the verdict changes along the sweep. */
export function describeRanges(kind: Degradation, ranges: DecisionRange[]): string {
  if (ranges.length === 0) return "";
  const span = (r: DecisionRange) => (r.from === r.to ? formatLevel(kind, r.from) : `${formatLevel(kind, r.from)} to ${formatLevel(kind, r.to)}`);
  if (ranges.length === 1) return `The verdict stays ${ranges[0]!.decision} across the whole range (${span(ranges[0]!)}).`;
  return `The verdict changes along the sweep: ${ranges.map((r) => `${r.decision} for ${span(r)}`).join(", then ")}.`;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}
