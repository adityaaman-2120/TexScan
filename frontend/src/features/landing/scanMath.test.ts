import { describe, expect, it } from "vitest";
import { clamp01, coverTransform, invertPingPong, MARKED, markedBox, PHOTO, pingPong, stepToward, type Box } from "./scanMath";

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

describe("coverTransform", () => {
  it("fills a canvas of the same shape exactly", () => {
    const t = coverTransform(PHOTO.width, PHOTO.height, 836, 470.5);
    expect(t.scale).toBeCloseTo(0.5, 3);
    expect(t.dx).toBeCloseTo(0, 3);
    expect(t.dy).toBeCloseTo(0, 3);
  });

  it("crops the sides when the canvas is squarer than the photo", () => {
    const t = coverTransform(1600, 900, 800, 800);
    expect(t.scale).toBeCloseTo(800 / 900);
    expect(t.dx).toBeLessThan(0);
    expect(t.dy).toBeCloseTo(0);
  });

  it("crops the top and bottom when the canvas is wider than the photo", () => {
    const t = coverTransform(1600, 900, 1600, 600);
    expect(t.scale).toBeCloseTo(1);
    expect(t.dx).toBeCloseTo(0);
    expect(t.dy).toBeLessThan(0);
  });
});

describe("MARKED", () => {
  const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it("sits inside the photo, as fractions", () => {
    for (const d of MARKED) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.x + d.w).toBeLessThanOrEqual(1);
      expect(d.y + d.h).toBeLessThanOrEqual(1);
    }
  });

  it("stays inside the canvas and apart, at common shapes", () => {
    for (const [w, h] of [[900, 506], [1200, 675], [340, 300], [600, 450], [390, 244]] as const) {
      const boxes = MARKED.map((d) => markedBox(d, w, h, 40));
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(w + 1e-6);
        expect(b.y + b.h).toBeLessThanOrEqual(h + 1e-6);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!), `${i} vs ${j} at ${w}x${h}`).toBe(false);
    }
  });

  it("grows a tiny defect to the minimum size around its centre", () => {
    const tear = MARKED.find((d) => d.label === "Tear")!;
    const plain = markedBox(tear, 1200, 675);
    const grown = markedBox(tear, 1200, 675, 44);
    expect(grown.w).toBeGreaterThanOrEqual(44);
    expect(grown.h).toBeGreaterThanOrEqual(44);
    expect(grown.x + grown.w / 2).toBeCloseTo(plain.x + plain.w / 2, 3);
    expect(grown.y + grown.h / 2).toBeCloseTo(plain.y + plain.h / 2, 3);
  });

  it("scales with the canvas", () => {
    const hole = MARKED[0]!;
    const full = markedBox(hole, PHOTO.width, PHOTO.height);
    const half = markedBox(hole, PHOTO.width / 2, PHOTO.height / 2);
    expect(full.x).toBeCloseTo(752, 3);
    expect(full.w).toBeCloseTo(182, 3);
    expect(half.x).toBeCloseTo(full.x / 2, 3);
    expect(half.h).toBeCloseTo(full.h / 2, 3);
  });
});
