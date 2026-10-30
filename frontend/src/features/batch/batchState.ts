export type ItemStatus = "queued" | "running" | "done" | "error";

export interface BatchItem {
  /** unique path, also the file name sent to the server, so events can be matched back */
  key: string;
  size: number;
  status: ItemStatus;
  decision?: "PASS" | "FAIL";
  defectCount?: number;
  inspectionId?: number;
  error?: string;
}

/** Messages on /ws/batch/{id}. */
export type BatchEvent =
  | {
      type: "progress";
      filename: string;
      total: number;
      done: number;
      inspection_id?: number;
      decision?: "PASS" | "FAIL";
      defect_count?: number;
      error?: string;
    }
  | { type: "complete"; total: number; done: number; passed: number; failed: number; errors: number }
  | { type: "error"; message: string };

const update = (items: BatchItem[], key: string, patch: Partial<BatchItem>): BatchItem[] =>
  items.map((item) => (item.key === key && (item.status === "queued" || item.status === "running") ? { ...item, ...patch } : item));

/** Fold one socket message into the item list. */
export function applyEvent(items: BatchItem[], event: BatchEvent): BatchItem[] {
  if (event.type !== "progress") return items;
  if (event.error !== undefined || event.inspection_id === undefined) {
    return update(items, event.filename, { status: "error", error: event.error ?? "no result" });
  }
  return update(items, event.filename, {
    status: "done",
    decision: event.decision,
    defectCount: event.defect_count,
    inspectionId: event.inspection_id,
  });
}

/** Rejected uploads (unreadable files) never produce progress events. */
export function applyRejections(items: BatchItem[], rejected: { filename: string; reason: string }[]): BatchItem[] {
  return rejected.reduce((acc, r) => update(acc, r.filename, { status: "error", error: r.reason }), items);
}

/** The server works through a batch in order, so the first waiting item is the one being processed. */
export function markRunning(items: BatchItem[]): BatchItem[] {
  const first = items.findIndex((i) => i.status === "queued" || i.status === "running");
  return items.map((item, i) => (i === first && item.status === "queued" ? { ...item, status: "running" } : item));
}

export interface BatchSummary {
  total: number;
  done: number;
  passed: number;
  failed: number;
  errors: number;
  /** passed / (passed + failed), or null when nothing was inspected */
  passRate: number | null;
}

export function summarize(items: BatchItem[]): BatchSummary {
  const passed = items.filter((i) => i.status === "done" && i.decision === "PASS").length;
  const failed = items.filter((i) => i.status === "done" && i.decision === "FAIL").length;
  const errors = items.filter((i) => i.status === "error").length;
  return { total: items.length, done: passed + failed + errors, passed, failed, errors, passRate: passed + failed ? passed / (passed + failed) : null };
}

export const isFinished = (items: BatchItem[]): boolean => items.length > 0 && items.every((i) => i.status === "done" || i.status === "error");
