import { describe, expect, it } from "vitest";
import { DEFECTS, makeSample, SAMPLES, type SampleKind } from "./sample";

const SIZE = 128;
const kinds = SAMPLES.map((s) => s.kind);

function differing(a: Uint8ClampedArray, b: Uint8ClampedArray, size: number): { count: number; x0: number; y0: number; x1: number; y1: number } {
  let count = 0;
  let x0 = size;
  let y0 = size;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 24) {
        count++;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  return { count, x0, y0, x1, y1 };
}

describe("makeSample", () => {
  it("returns an opaque RGBA picture of the requested size", () => {
    const s = makeSample("clean", SIZE);
    expect([s.width, s.height, s.data.length]).toEqual([SIZE, SIZE, SIZE * SIZE * 4]);
    for (let i = 3; i < s.data.length; i += 4) expect(s.data[i]).toBe(255);
  });

  it("is deterministic, and the seed changes the noise", () => {
    expect(makeSample("hole", SIZE).data).toEqual(makeSample("hole", SIZE).data);
    expect(makeSample("clean", SIZE, 1).data).not.toEqual(makeSample("clean", SIZE, 2).data);
  });

  it("has a regular weave: the same column looks the same all the way down, apart from noise", () => {
    const s = makeSample("clean", SIZE);
    const column = (x: number) => [...Array(SIZE).keys()].map((y) => s.data[(y * SIZE + x) * 4 + 1]!);
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(Math.abs(mean(column(2)) - mean(column(2 + SIZE / 16 / 2)))).toBeGreaterThan(40); // half a weave cycle apart: dark against light
    expect(Math.max(...column(2)) - Math.min(...column(2))).toBeLessThan(20); // but flat within one column
  });

  it("plants each defect where its geometry says, and nowhere else", () => {
    const clean = makeSample("clean", SIZE);
    const expected: Record<Exclude<SampleKind, "clean">, [number, number, number, number]> = {
      hole: [DEFECTS.hole.cx - DEFECTS.hole.r, DEFECTS.hole.cy - DEFECTS.hole.r, DEFECTS.hole.cx + DEFECTS.hole.r, DEFECTS.hole.cy + DEFECTS.hole.r],
      stain: [DEFECTS.stain.cx - DEFECTS.stain.r * 1.3, DEFECTS.stain.cy - DEFECTS.stain.r * 1.3, DEFECTS.stain.cx + DEFECTS.stain.r * 1.3, DEFECTS.stain.cy + DEFECTS.stain.r * 1.3],
      tear: [DEFECTS.tear.x0, DEFECTS.tear.y - 0.03, DEFECTS.tear.x1, DEFECTS.tear.y + 0.03],
    };
    for (const kind of kinds.filter((k) => k !== "clean") as Exclude<SampleKind, "clean">[]) {
      const d = differing(clean.data, makeSample(kind, SIZE).data, SIZE);
      const [ex0, ey0, ex1, ey1] = expected[kind].map((v) => v * SIZE) as [number, number, number, number];
      expect(d.count, kind).toBeGreaterThan(8);
      expect(d.x0, kind).toBeGreaterThanOrEqual(ex0 - 2);
      expect(d.y0, kind).toBeGreaterThanOrEqual(ey0 - 2);
      expect(d.x1, kind).toBeLessThanOrEqual(ex1 + 2);
      expect(d.y1, kind).toBeLessThanOrEqual(ey1 + 2);
    }
  });

  it("offers a clean sample and three defects, each with a label and a hint", () => {
    expect(kinds).toEqual(["clean", "hole", "stain", "tear"]);
    for (const s of SAMPLES) expect(s.label.length * s.hint.length).toBeGreaterThan(0);
  });
});
