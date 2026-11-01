import { describe, expect, it } from "vitest";
import { DEMO_CONFIG, DEMO_METHOD, SAMPLE_SIZE, SAMPLES } from "./sample";

describe("SAMPLES", () => {
  it("offers a clean sample and three defects, in order", () => {
    expect(SAMPLES.map((s) => s.kind)).toEqual(["clean", "hole", "stain", "tear"]);
  });

  it("gives every sample a label, a hint and its own picture", () => {
    for (const s of SAMPLES) {
      expect(s.label.length * s.hint.length).toBeGreaterThan(0);
      expect(s.src).toMatch(/^\/samples\/[a-z]+\.jpg$/);
    }
    expect(new Set(SAMPLES.map((s) => s.src)).size).toBe(SAMPLES.length);
  });
});

describe("demo settings", () => {
  it("inspects at the sample's own size, with a known method", () => {
    expect(DEMO_CONFIG.max_side).toBe(SAMPLE_SIZE);
    expect(["fft", "gabor", "local_statistics", "golden_template"]).toContain(DEMO_METHOD);
  });
});
