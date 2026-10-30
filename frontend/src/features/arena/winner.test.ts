import { describe, expect, it } from "vitest";
import type { ArenaMethodResult } from "@/api/types";
import { bestOf, cleanLeaders, fastest, pickWinner, truthOf } from "./winner";

const r = (method: string, extra: Partial<ArenaMethodResult> = {}): ArenaMethodResult =>
  ({ method, status: "ok", defects: [], total_ms: 100, decision: "FAIL", defect_area_percent: 1, ...extra }) as ArenaMethodResult;

describe("truthOf", () => {
  it("maps the API's ground-truth fields", () => {
    expect(truthOf(false, null)).toBe("none");
    expect(truthOf(true, true)).toBe("defective");
    expect(truthOf(true, false)).toBe("clean");
  });
});

describe("pickWinner on a defective image", () => {
  it("picks the highest IoU", () => {
    expect(pickWinner([r("fft", { iou: 0.4 }), r("gabor", { iou: 0.7 }), r("local_statistics", { iou: 0.2 })], "defective")).toBe("gabor");
  });

  it("breaks IoU ties by Dice, then by speed", () => {
    expect(pickWinner([r("a", { iou: 0.5, dice: 0.6 }), r("b", { iou: 0.5, dice: 0.7 })], "defective")).toBe("b");
    expect(pickWinner([r("a", { iou: 0.5, dice: 0.6, total_ms: 900 }), r("b", { iou: 0.5, dice: 0.6, total_ms: 50 })], "defective")).toBe("b");
  });

  it("ignores skipped and failed methods, and crowns nobody if nothing overlaps the truth", () => {
    const skipped = r("golden_template", { status: "skipped", iou: undefined });
    expect(pickWinner([skipped, r("fft", { iou: 0.1 })], "defective")).toBe("fft");
    expect(pickWinner([skipped, r("fft", { iou: 0 }), r("gabor", { iou: 0 })], "defective")).toBeNull();
    expect(pickWinner([], "defective")).toBeNull();
  });
});

describe("pickWinner on a clean image", () => {
  const pass = (method: string, area: number, ms = 100) => r(method, { correct: true, decision: "PASS", defect_area_percent: area, total_ms: ms });
  const fail = (method: string) => r(method, { correct: false, decision: "FAIL", defect_area_percent: 30 });

  it("only methods that pass can win; the smallest false alarm leads", () => {
    expect(pickWinner([fail("fft"), pass("gabor", 0.4), pass("local_statistics", 0.1)], "clean")).toBe("local_statistics");
  });

  it("a tie crowns nobody, however different the speeds are", () => {
    expect(pickWinner([pass("fft", 0, 500), pass("gabor", 0, 20), fail("golden_template")], "clean")).toBeNull();
    expect(cleanLeaders([pass("fft", 0, 500), pass("gabor", 0, 20), fail("golden_template")]).map((x) => x.method)).toEqual(["fft", "gabor"]);
  });

  it("is null when every method raises a false alarm", () => {
    expect(pickWinner([fail("fft"), fail("gabor")], "clean")).toBeNull();
    expect(cleanLeaders([fail("fft")])).toEqual([]);
  });
});

describe("pickWinner without ground truth", () => {
  it("never crowns anyone", () => {
    expect(pickWinner([r("fft"), r("gabor")], "none")).toBeNull();
  });
});

describe("fastest / bestOf", () => {
  it("fastest ignores methods that did not run", () => {
    expect(fastest([r("fft", { total_ms: 500 }), r("gabor", { total_ms: 80 }), r("x", { status: "error", total_ms: 1 })])).toBe("gabor");
    expect(fastest([])).toBeNull();
  });

  it("bestOf skips missing values", () => {
    expect(bestOf([r("a", { iou: 0.3 }), r("b", { iou: null }), r("c", { iou: 0.6 })], "iou")).toBe(0.6);
    expect(bestOf([r("a")], "iou")).toBeNull();
  });
});
