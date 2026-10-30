import { describe, expect, it } from "vitest";
import { decisionRanges, describeRanges, DEGRADATIONS, DEGRADATION_ORDER, formatBytes, formatLevel, levelsFor } from "./levels";

describe("levelsFor", () => {
  it("spans each degradation's range, ascending, with exactly the requested number of steps", () => {
    for (const kind of DEGRADATION_ORDER) {
      const levels = levelsFor(kind, 7);
      expect(levels).toHaveLength(7);
      expect(levels[0]).toBe(DEGRADATIONS[kind].lo);
      expect(levels.at(-1)).toBe(DEGRADATIONS[kind].hi);
      expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    }
  });

  it("rounds to the degradation's precision", () => {
    expect(levelsFor("blur", 5)).toEqual([0, 1.5, 3, 4.5, 6]);
    expect(levelsFor("gaussian_noise", 5)).toEqual([0, 15, 30, 45, 60]);
    expect(levelsFor("brightness", 5)).toEqual([-80, -40, 0, 40, 80]);
  });

  it("stays within what the API accepts and never repeats a level", () => {
    expect(levelsFor("blur", 50).length).toBeLessThanOrEqual(12);
    expect(levelsFor("blur", 1)).toHaveLength(2);
    const levels = levelsFor("jpeg_quality", 12);
    expect(new Set(levels).size).toBe(levels.length);
    levels.forEach((q) => expect(q >= 1 && q <= 100).toBe(true));
  });
});

describe("decisionRanges", () => {
  const pts = (list: [number, "PASS" | "FAIL"][]) => list.map(([level, decision]) => ({ level, decision }));

  it("merges consecutive levels with the same verdict, in level order", () => {
    expect(decisionRanges(pts([[20, "FAIL"], [0, "PASS"], [10, "PASS"], [40, "FAIL"]]))).toEqual([
      { decision: "PASS", from: 0, to: 10 },
      { decision: "FAIL", from: 20, to: 40 },
    ]);
  });

  it("keeps separate ranges when the verdict flips back", () => {
    const ranges = decisionRanges(pts([[0, "PASS"], [10, "FAIL"], [20, "PASS"]]));
    expect(ranges.map((r) => r.decision)).toEqual(["PASS", "FAIL", "PASS"]);
  });

  it("handles one point and none", () => {
    expect(decisionRanges(pts([[5, "FAIL"]]))).toEqual([{ decision: "FAIL", from: 5, to: 5 }]);
    expect(decisionRanges([])).toEqual([]);
  });
});

describe("describeRanges", () => {
  it("says where the verdict changes", () => {
    const text = describeRanges("gaussian_noise", [{ decision: "FAIL", from: 0, to: 15 }, { decision: "PASS", from: 30, to: 60 }]);
    expect(text).toBe("The verdict changes along the sweep: FAIL for 0 to 15, then PASS for 30 to 60.");
  });

  it("says when it never changes", () => {
    expect(describeRanges("blur", [{ decision: "FAIL", from: 0, to: 6 }])).toBe("The verdict stays FAIL across the whole range (0.0 to 6.0).");
    expect(describeRanges("blur", [])).toBe("");
  });
});

describe("formatters", () => {
  it("formats levels and byte sizes", () => {
    expect(formatLevel("blur", 1.5)).toBe("1.5");
    expect(formatLevel("jpeg_quality", 80)).toBe("80");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });
});
