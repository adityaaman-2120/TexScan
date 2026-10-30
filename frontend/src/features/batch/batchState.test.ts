import { describe, expect, it } from "vitest";
import { applyEvent, applyRejections, isFinished, markRunning, summarize, type BatchItem } from "./batchState";

const queued = (key: string): BatchItem => ({ key, size: 1, status: "queued" });
const items = (...keys: string[]) => keys.map(queued);
const progress = (filename: string, extra: Record<string, unknown> = {}) => ({
  type: "progress" as const,
  filename,
  total: 3,
  done: 1,
  inspection_id: 7,
  decision: "PASS" as const,
  defect_count: 0,
  ...extra,
});

describe("applyEvent", () => {
  it("marks the matching item done with its decision", () => {
    const next = applyEvent(items("a.png", "b.png"), progress("b.png", { decision: "FAIL", defect_count: 3, inspection_id: 9 }));
    expect(next[0]!.status).toBe("queued");
    expect(next[1]).toMatchObject({ status: "done", decision: "FAIL", defectCount: 3, inspectionId: 9 });
  });

  it("turns an error event into an error item", () => {
    const next = applyEvent(items("a.png"), { type: "progress", filename: "a.png", total: 1, done: 1, error: "boom" });
    expect(next[0]).toMatchObject({ status: "error", error: "boom" });
  });

  it("ignores events for unknown files, repeats and non-progress messages", () => {
    const base = items("a.png");
    expect(applyEvent(base, progress("zzz.png"))).toEqual(base);
    const done = applyEvent(base, progress("a.png"));
    expect(applyEvent(done, progress("a.png", { decision: "FAIL" }))[0]!.decision).toBe("PASS"); // first result wins
    expect(applyEvent(base, { type: "complete", total: 1, done: 1, passed: 1, failed: 0, errors: 0 })).toBe(base);
  });

  it("does not mutate its input", () => {
    const base = items("a.png");
    applyEvent(base, progress("a.png"));
    expect(base[0]!.status).toBe("queued");
  });
});

describe("applyRejections", () => {
  it("marks unreadable files as errors with the server's reason", () => {
    const next = applyRejections(items("a.png", "b.png"), [{ filename: "b.png", reason: "not a readable image" }]);
    expect(next.map((i) => i.status)).toEqual(["queued", "error"]);
    expect(next[1]!.error).toBe("not a readable image");
  });
});

describe("markRunning", () => {
  it("flags only the first waiting item", () => {
    const next = markRunning(items("a", "b", "c"));
    expect(next.map((i) => i.status)).toEqual(["running", "queued", "queued"]);
  });

  it("moves on when the running one finishes", () => {
    const step = markRunning(applyEvent(markRunning(items("a", "b")), progress("a")));
    expect(step.map((i) => i.status)).toEqual(["done", "running"]);
  });

  it("does nothing when everything is finished", () => {
    const done = applyEvent(items("a"), progress("a"));
    expect(markRunning(done)).toEqual(done);
  });
});

describe("summarize / isFinished", () => {
  it("counts passes, fails and errors and computes the pass rate", () => {
    let list = items("a", "b", "c", "d");
    list = applyEvent(list, progress("a"));
    list = applyEvent(list, progress("b", { decision: "FAIL" }));
    list = applyEvent(list, progress("c"));
    list = applyRejections(list, [{ filename: "d", reason: "bad" }]);
    expect(summarize(list)).toEqual({ total: 4, done: 4, passed: 2, failed: 1, errors: 1, passRate: 2 / 3 });
    expect(isFinished(list)).toBe(true);
  });

  it("has no pass rate before anything finished and is not finished while items wait", () => {
    expect(summarize(items("a"))).toMatchObject({ done: 0, passRate: null });
    expect(isFinished(items("a"))).toBe(false);
    expect(isFinished([])).toBe(false);
  });
});
