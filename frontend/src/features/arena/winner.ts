import type { ArenaMethodResult } from "@/api/types";

/** What the ground truth says about the image: it has defect pixels, it is clean, or none was supplied. */
export type Truth = "defective" | "clean" | "none";

export function truthOf(provided: boolean, defective: boolean | null | undefined): Truth {
  return !provided ? "none" : defective ? "defective" : "clean";
}

const ok = (r: ArenaMethodResult): boolean => r.status === "ok";

/**
 * The winning method, or null when there is nothing fair to crown.
 *
 * - defective image: highest IoU (then Dice, then faster); a method must overlap the truth at all.
 * - clean image: among the methods that correctly PASS, the one with the smallest false-alarm area. If several share that
 *   smallest area it is a tie, and nobody is crowned (speed alone does not make a winner).
 * - no ground truth: nobody wins, because there is nothing to measure against.
 */
export function pickWinner(results: ArenaMethodResult[], truth: Truth): string | null {
  const byTime = (a: ArenaMethodResult, b: ArenaMethodResult) => (a.total_ms ?? Infinity) - (b.total_ms ?? Infinity);
  if (truth === "defective") {
    const ranked = results
      .filter((r) => ok(r) && (r.iou ?? 0) > 0)
      .sort((a, b) => (b.iou ?? 0) - (a.iou ?? 0) || (b.dice ?? 0) - (a.dice ?? 0) || byTime(a, b));
    return ranked[0]?.method ?? null;
  }
  if (truth === "clean") {
    const best = cleanLeaders(results);
    return best.length === 1 ? best[0]!.method : null;
  }
  return null;
}

/** On a clean image: the correct (PASS) methods with the smallest false-alarm area; more than one means a tie. */
export function cleanLeaders(results: ArenaMethodResult[]): ArenaMethodResult[] {
  const passing = results.filter((r) => ok(r) && r.correct === true);
  if (passing.length === 0) return [];
  const smallest = Math.min(...passing.map((r) => r.defect_area_percent ?? 0));
  return passing.filter((r) => Math.abs((r.defect_area_percent ?? 0) - smallest) < 1e-9);
}

export function fastest(results: ArenaMethodResult[]): string | null {
  const timed = results.filter((r) => ok(r) && r.total_ms != null).sort((a, b) => a.total_ms! - b.total_ms!);
  return timed[0]?.method ?? null;
}

/** The best value of a metric among the successful results (for "behind the best by x"). */
export function bestOf(results: ArenaMethodResult[], key: "iou" | "dice" | "precision" | "recall" | "f1"): number | null {
  const values = results.filter(ok).map((r) => r[key]).filter((v): v is number => v != null);
  return values.length ? Math.max(...values) : null;
}
