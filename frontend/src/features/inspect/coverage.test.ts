import { describe, expect, it } from "vitest";
import { coverageOf, SHRUNK_AT } from "./coverage";

const cfg = (over: Partial<{ center_fraction: number; max_side: number; min_area: number }> = {}) => ({
  center_fraction: over.center_fraction ?? 1,
  max_side: over.max_side ?? 1024,
  morphology: { min_area: over.min_area ?? 50 },
});

describe("coverageOf", () => {
  it("says the whole picture was checked, with nothing to warn about, for ordinary settings", () => {
    const c = coverageOf(cfg(), 1000, 1000);
    expect(c.region).toBe("the whole picture");
    expect(c.limits).toEqual([]);
    expect(c.smallest).toBe("<0.1%"); // 50 px of a million
  });

  it("names the middle part when the edges were skipped, and says the edges were not checked", () => {
    const c = coverageOf(cfg({ center_fraction: 0.6 }), 400, 400);
    expect(c.region).toBe("the middle 60% of the picture");
    expect(c.limits[0]).toMatch(/outside it.*edges.*not checked/i);
  });

  it("warns when the smallest counted defect is a noticeable share of the picture", () => {
    // the settings behind a PASS on a photo of a towel with small holes: 464 px of a 313 x 320 picture
    const c = coverageOf(cfg({ center_fraction: 0.6, max_side: 320, min_area: 464 }), 313, 320);
    expect(c.smallest).toBe("0.5%");
    expect(c.limits.some((l) => /smaller than about 0\.5%.*small holes/i.test(l))).toBe(true);
    expect(c.limits.some((l) => l.includes("shrunk to 320 px"))).toBe(true);
    expect(c.limits).toHaveLength(3);
  });

  it("does not call a modest minimum size a limit", () => {
    expect(coverageOf(cfg({ min_area: 50, max_side: 512 }), 512, 384).limits).toEqual([]);
  });

  it("only mentions shrinking at or below the threshold size", () => {
    expect(coverageOf(cfg({ max_side: SHRUNK_AT }), 400, 300).limits.some((l) => l.includes("shrunk"))).toBe(true);
    expect(coverageOf(cfg({ max_side: SHRUNK_AT + 1 }), 400, 300).limits.some((l) => l.includes("shrunk"))).toBe(false);
  });

  it("copes with an empty picture", () => {
    expect(coverageOf(cfg(), 0, 0).smallest).toBeNull();
  });
});
