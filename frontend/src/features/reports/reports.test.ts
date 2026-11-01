import { describe, expect, it } from "vitest";
import { groupBatches, passRate } from "./reports";

const row = (batch_id: string | null, decision: "PASS" | "FAIL", created_at: string) => ({ batch_id, decision, created_at });

describe("groupBatches", () => {
  it("groups by batch id and counts passes and fails", () => {
    const groups = groupBatches([
      row("a", "PASS", "2026-10-01T10:00:00Z"),
      row("a", "FAIL", "2026-10-01T10:00:05Z"),
      row("a", "PASS", "2026-10-01T10:00:09Z"),
      row("b", "FAIL", "2026-10-02T09:00:00Z"),
    ]);
    expect(groups.find((g) => g.id === "a")).toMatchObject({ total: 3, passed: 2, failed: 1, latest: "2026-10-01T10:00:09Z" });
    expect(groups.find((g) => g.id === "b")).toMatchObject({ total: 1, passed: 0, failed: 1 });
  });

  it("lists the newest batch first", () => {
    const groups = groupBatches([row("old", "PASS", "2026-09-01T00:00:00Z"), row("new", "PASS", "2026-10-01T00:00:00Z")]);
    expect(groups.map((g) => g.id)).toEqual(["new", "old"]);
  });

  it("ignores inspections that were not part of a batch", () => {
    expect(groupBatches([row(null, "PASS", "2026-10-01T00:00:00Z"), row(undefined as unknown as null, "FAIL", "2026-10-01T00:00:00Z")])).toEqual([]);
  });
});

describe("passRate", () => {
  it("is a whole percent, and 0 for an empty group", () => {
    expect(passRate({ total: 3, passed: 2 })).toBe(67);
    expect(passRate({ total: 0, passed: 0 })).toBe(0);
  });
});
