import { describe, expect, it } from "vitest";
import { formatShare, shareAbove, toBins } from "./histogram";

const hist = { edges: [0, 10, 20, 30, 40], counts: [100, 50, 10, 0], clipped: false };

describe("toBins", () => {
  it("pairs edges with counts and computes midpoints", () => {
    expect(toBins(hist)[1]).toEqual({ lo: 10, hi: 20, mid: 15, count: 50 });
    expect(toBins(hist)).toHaveLength(4);
  });
});

describe("shareAbove", () => {
  it("is 1 below the first edge and 0 above the last", () => {
    expect(shareAbove(hist, -5)).toBe(1);
    expect(shareAbove(hist, 40)).toBe(0);
  });

  it("counts whole bins above a bin edge", () => {
    expect(shareAbove(hist, 20)).toBeCloseTo(10 / 160);
    expect(shareAbove(hist, 10)).toBeCloseTo(60 / 160);
  });

  it("interpolates inside a bin", () => {
    expect(shareAbove(hist, 15)).toBeCloseTo((25 + 10) / 160); // half of the 50 in the second bin, plus the whole third
  });

  it("is 0 for an empty histogram", () => {
    expect(shareAbove({ edges: [0, 1], counts: [0], clipped: false }, 0.5)).toBe(0);
  });
});

describe("formatShare", () => {
  it("formats tiny, small and large shares", () => {
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(0.000001)).toBe("<0.01%");
    expect(formatShare(0.0031)).toBe("0.31%");
    expect(formatShare(0.1234)).toBe("12.3%");
  });
});
