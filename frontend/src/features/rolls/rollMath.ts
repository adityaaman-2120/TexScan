export const YARD_M = 0.9144;
export const MM_PER_INCH = 25.4;

export type RollLengthUnit = "m" | "yd";
export type RollWidthUnit = "cm" | "in" | "mm";

/** A typed number that is greater than zero (decimal comma accepted), else null. */
export function parsePositive(value: string): number | null {
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function lengthToMetres(value: string, unit: RollLengthUnit): number | null {
  const n = parsePositive(value);
  return n === null ? null : unit === "yd" ? n * YARD_M : n;
}

export function widthToMm(value: string, unit: RollWidthUnit): number | null {
  const n = parsePositive(value);
  return n === null ? null : n * { mm: 1, cm: 10, in: MM_PER_INCH }[unit];
}

export const metresToYards = (m: number): number => m / YARD_M;
export const formatMetres = (m: number): string => `${m.toFixed(2)} m`;
export const formatYards = (yd: number): string => `${yd.toFixed(yd < 10 ? 2 : 1)} yd`;
export const formatPoints = (points: number): string => points.toFixed(1);

/** Marker colours by points: a muted-to-destructive ramp built from the theme tokens. */
export const POINT_COLORS: Record<1 | 2 | 3 | 4, string> = {
  1: "var(--muted-foreground)",
  2: "var(--warning)",
  3: "color-mix(in oklab, var(--warning) 45%, var(--destructive))",
  4: "var(--destructive)",
};

export function pointsColor(points: number): string {
  return POINT_COLORS[Math.min(4, Math.max(1, Math.round(points))) as 1 | 2 | 3 | 4];
}

export interface MarkerLayout {
  key: string;
  /** Distance from the roll start as a percentage of its length. */
  top: number;
  /** Side-by-side column, so markers at nearly the same position do not hide each other. */
  lane: number;
}

/**
 * Place markers on the strip. A marker moves to the next lane while an earlier marker in that lane is closer than
 * `minGapPercent` along the strip; with all lanes busy it takes the least recently used one.
 */
export function layoutMarkers(items: { key: string; position_m: number }[], lengthM: number, minGapPercent = 1.8, lanes = 4): MarkerLayout[] {
  const lastTop: number[] = Array.from({ length: lanes }, () => -Infinity);
  return [...items]
    .sort((a, b) => a.position_m - b.position_m)
    .map((item) => {
      const top = lengthM > 0 ? Math.min(100, Math.max(0, (item.position_m / lengthM) * 100)) : 0;
      let lane = lastTop.findIndex((t) => top - t >= minGapPercent);
      if (lane === -1) lane = lastTop.indexOf(Math.min(...lastTop));
      lastTop[lane] = top;
      return { key: item.key, top, lane };
    });
}

/** The stretches of the roll that captures cover, as percentages of its length. */
export function coverageBars(captures: { start_m: number; covered_m: number }[], lengthM: number): { top: number; height: number }[] {
  if (lengthM <= 0) return [];
  return captures
    .map((c) => {
      const start = Math.max(0, c.start_m);
      const end = Math.min(lengthM, c.start_m + c.covered_m);
      return { top: (start / lengthM) * 100, height: Math.max(0, ((end - start) / lengthM) * 100) };
    })
    .filter((b) => b.height > 0);
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Where the next picture goes so it follows the furthest one without overlapping it (0 on an empty roll). */
export function nextPosition(captures: { start_m: number; covered_m: number }[], lengthM: number): number {
  const reach = captures.reduce((far, c) => Math.max(far, c.start_m + c.covered_m), 0);
  return round2(Math.min(reach, lengthM));
}

/** `count` metre marks from `start`, `step` apart, kept within the roll. */
export function spacedPositions(start: number, step: number, count: number, lengthM: number): number[] {
  return Array.from({ length: count }, (_, i) => round2(Math.min(lengthM, Math.max(0, start + i * step))));
}

const NICE_STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

/** Metre marks for the strip's axis: a round step that gives about ten ticks or fewer. */
export function axisTicks(lengthM: number, maxTicks = 10): number[] {
  if (lengthM <= 0) return [0];
  const step = NICE_STEPS.find((s) => lengthM / s <= maxTicks) ?? NICE_STEPS[NICE_STEPS.length - 1]!;
  const ticks: number[] = [];
  for (let m = 0; m <= lengthM + 1e-9; m += step) ticks.push(round2(m));
  return ticks;
}

export type VerdictTone = "pass" | "fail" | "neutral";

export function verdictOf(summary: { capture_count: number; accepted: boolean }): { label: string; tone: VerdictTone } {
  if (summary.capture_count === 0) return { label: "Not inspected", tone: "neutral" };
  return summary.accepted ? { label: "Accept", tone: "pass" } : { label: "Reject", tone: "fail" };
}
