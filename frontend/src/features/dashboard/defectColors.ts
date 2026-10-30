import type { DefectKind } from "@/features/inspect/defectLabels";

/**
 * Colour follows the defect type, never its rank, so a type keeps its colour whatever the counts are.
 * Slots are the validated categorical hues in fixed order; "unknown" folds into the neutral "other" gray.
 */
export const DEFECT_COLORS: Record<DefectKind, string> = {
  hole: "var(--series-1)",
  tear_line: "var(--series-2)",
  stain: "var(--series-3)",
  thread_fiber: "var(--series-4)",
  unknown: "var(--series-other)",
};

export const DEFECT_ORDER: DefectKind[] = ["hole", "tear_line", "stain", "thread_fiber", "unknown"];

export interface DefectSlice {
  type: DefectKind;
  count: number;
}

/** Counts from the API in a stable order (the fixed type order, then any type this client does not know yet as "unknown"). */
export function defectSlices(byType: Record<string, number>): DefectSlice[] {
  const known = new Set<string>(DEFECT_ORDER);
  const extra = Object.entries(byType).filter(([k]) => !known.has(k)).reduce((sum, [, n]) => sum + n, 0);
  return DEFECT_ORDER.map((type) => ({ type, count: (byType[type] ?? 0) + (type === "unknown" ? extra : 0) })).filter((s) => s.count > 0);
}

/** The biggest slice, preferring a classified type: "unknown" only wins when nothing else was found. */
export function mostCommon(slices: DefectSlice[]): DefectSlice | undefined {
  const classified = slices.filter((s) => s.type !== "unknown");
  return (classified.length > 0 ? classified : slices).reduce<DefectSlice | undefined>((best, s) => (!best || s.count > best.count ? s : best), undefined);
}

/** Whole-number percentage, but "<1%" for a share that exists yet rounds to zero. */
export function formatPercent(count: number, total: number): string {
  if (total === 0 || count === 0) return "0%";
  const pct = (count / total) * 100;
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}
