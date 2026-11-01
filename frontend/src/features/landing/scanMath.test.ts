import { describe, expect, it } from "vitest";
import { clamp01, invertPingPong, pingPong, SPOTS, spotBox, stepToward, type Box } from "./scanMath";

describe("pingPong", () => {
  it("goes 0 to 1 to 0 over one period", () => {
    expect(pingPong(0, 10)).toBeCloseTo(0);
    expect(pingPong(5, 10)).toBeCloseTo(1);
    expect(pingPong(10, 10)).toBeCloseTo(0);
    expect(pingPong(2.5, 10)).toBeCloseTo(0.5); // smoothstep(0.5) = 0.5
  });

  it("stays within 0..1 and is periodic, including for negative time", () => {
    for (const t of [-13.7, -1, 0.3, 4.4, 9.99, 27.2]) {
      const v = pingPong(t, 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(pingPong(t + 10, 10)).toBeCloseTo(v);
    }
  });

  it("is continuous: a tiny step in time never jumps", () => {
    let prev = pingPong(0);
    for (let t = 0.01; t < 20; t += 0.01) {
      const v = pingPong(t);
      expect(Math.abs(v - prev)).toBeLessThan(0.02);
      prev = v;
    }
  });
});

describe("invertPingPong", () => {
  it("finds the time at which the sweep is at a given position", () => {
    for (const p of [0.02, 0.25, 0.5, 0.8, 0.98]) expect(pingPong(invertPingPong(p, 10), 10)).toBeCloseTo(p, 4);
    expect(invertPingPong(0, 10)).toBeCloseTo(0, 3);
    expect(invertPingPong(1, 10)).toBeCloseTo(5, 3);
  });
});

describe("stepToward", () => {
  it("does not move without time passing, and never overshoots", () => {
    expect(stepToward(0.2, 0.9, 0)).toBe(0.2);
    expect(stepToward(0.2, 0.9, -1)).toBe(0.2);
    let v = 0.2;
    for (let i = 0; i < 200; i++) {
      v = stepToward(v, 0.9, 1 / 60);
      expect(v).toBeLessThanOrEqual(0.9);
    }
    expect(v).toBeCloseTo(0.9, 3);
  });

  it("covers the same ground per second whatever the frame rate", () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 30; i++) a = stepToward(a, 1, 1 / 30);
    for (let i = 0; i < 120; i++) b = stepToward(b, 1, 1 / 120);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("clamp01", () => {
  it("clamps", () => {
    expect([clamp01(-1), clamp01(0.4), clamp01(7)]).toEqual([0, 0.4, 1]);
  });
});

describe("SPOTS", () => {
  const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("keeps every defect inside the cloth and apart from the others, at common shapes", () => {
    for (const [w, h] of [[560, 420], [900, 675], [1200, 900], [340, 255]] as const) {
      const boxes = SPOTS.map((s) => spotBox(s, w, h));
      for (const b of boxes) {
        expect(b.x).toBeGreaterThan(0);
        expect(b.y).toBeGreaterThan(0);
        expect(b.x + b.w).toBeLessThan(w);
        expect(b.y + b.h).toBeLessThan(h);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!), `${i} vs ${j} at ${w}x${h}`).toBe(false);
    }
  });

  it("makes a thread wider than it is tall", () => {
    const thread = SPOTS.find((s) => s.kind === "thread")!;
    const b = spotBox(thread, 1000, 800);
    expect(b.w).toBeGreaterThan(b.h * 4);
  });
});
