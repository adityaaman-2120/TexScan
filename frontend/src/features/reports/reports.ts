import type { InspectionSummary } from "@/api/types";

export interface BatchGroup {
  id: string;
  total: number;
  passed: number;
  failed: number;
  /** Newest inspection in the batch (ISO time). */
  latest: string;
}

type Row = Pick<InspectionSummary, "batch_id" | "decision" | "created_at">;

/** Groups inspections that share a batch id, newest batch first. Inspections without a batch are ignored. */
export function groupBatches(items: Row[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();
  for (const item of items) {
    if (!item.batch_id) continue;
    const g = groups.get(item.batch_id) ?? { id: item.batch_id, total: 0, passed: 0, failed: 0, latest: item.created_at };
    g.total += 1;
    if (item.decision === "PASS") g.passed += 1;
    else g.failed += 1;
    if (Date.parse(item.created_at) > Date.parse(g.latest)) g.latest = item.created_at;
    groups.set(item.batch_id, g);
  }
  return [...groups.values()].sort((a, b) => Date.parse(b.latest) - Date.parse(a.latest));
}

/** Pass rate of a group as a whole percent (0 for an empty one). */
export function passRate(g: Pick<BatchGroup, "total" | "passed">): number {
  return g.total === 0 ? 0 : Math.round((g.passed / g.total) * 100);
}
