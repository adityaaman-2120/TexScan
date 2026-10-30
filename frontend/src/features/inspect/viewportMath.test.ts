import { describe, expect, it } from "vitest";
import { bboxToRect, clamp, fitView, MAX_SCALE, viewForRect, zoomAround } from "./viewportMath";

/** image point -> container point under a view */
const toScreen = (v: { scale: number; x: number; y: number }, px: number, py: number) => ({ x: v.x + px * v.scale, y: v.y + py * v.scale });

describe("fitView", () => {
  it("fits the whole image and centres it", () => {
    const v = fitView(800, 400, 1000, 1000, 1);
    expect(v.scale).toBeCloseTo(0.4); // limited by height
    expect(v.x).toBeCloseTo((800 - 400) / 2);
    expect(v.y).toBeCloseTo(0);
  });

  it("leaves a margin by default", () => {
    expect(fitView(1000, 1000, 1000, 1000).scale).toBeLessThan(1);
  });
});

describe("zoomAround", () => {
  it("keeps the image point under the cursor fixed", () => {
    const v = { scale: 0.5, x: 30, y: -20 };
    const before = toScreen(v, 400, 300);
    const next = zoomAround(v, 3, before.x, before.y);
    const after = toScreen(next, 400, 300);
    expect(next.scale).toBeCloseTo(1.5);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps the scale", () => {
    expect(zoomAround({ scale: 30, x: 0, y: 0 }, 100, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAround({ scale: 0.06, x: 0, y: 0 }, 0.001, 0, 0).scale).toBeGreaterThan(0);
  });
});

describe("viewForRect", () => {
  it("centres the rectangle in the container", () => {
    const rect = { x: 400, y: 200, w: 50, h: 50 };
    const v = viewForRect(800, 600, rect);
    const centre = toScreen(v, 425, 225);
    expect(centre.x).toBeCloseTo(400);
    expect(centre.y).toBeCloseTo(300);
  });

  it("does not zoom past maxScale for a tiny defect", () => {
    expect(viewForRect(800, 600, { x: 10, y: 10, w: 2, h: 2 }, 0.6, 12).scale).toBeLessThanOrEqual(12);
  });

  it("shows the whole rectangle with padding", () => {
    const rect = { x: 100, y: 100, w: 300, h: 100 };
    const v = viewForRect(900, 600, rect);
    const topLeft = toScreen(v, rect.x, rect.y);
    const bottomRight = toScreen(v, rect.x + rect.w, rect.y + rect.h);
    expect(topLeft.x).toBeGreaterThan(0);
    expect(bottomRight.x).toBeLessThan(900);
    expect(bottomRight.y).toBeLessThan(600);
  });
});

describe("helpers", () => {
  it("clamp and bboxToRect", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(bboxToRect([1, 2, 3, 4])).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
});
