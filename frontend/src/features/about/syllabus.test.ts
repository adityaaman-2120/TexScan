import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/app/nav";
import { coverageCounts, SYLLABUS } from "./syllabus";

const REQUIRED = ["read-image", "noise", "histogram", "edges", "registration", "bit-planes", "enhancement", "fft", "spatial-filtering", "frequency-filtering", "compression", "morphology", "restoration"];

describe("syllabus map", () => {
  it("covers every syllabus topic exactly once", () => {
    expect(SYLLABUS.map((i) => i.id).sort()).toEqual([...REQUIRED].sort());
  });

  it("links only to pages that exist", () => {
    const paths = new Set(NAV_ITEMS.map((n) => n.path));
    for (const item of SYLLABUS) expect(paths.has(item.path), `${item.id} -> ${item.path}`).toBe(true);
  });

  it("explains every entry and says what the limit is when it is only partly covered", () => {
    for (const item of SYLLABUS) {
      expect(item.summary.length).toBeGreaterThan(40);
      expect(item.code).toMatch(/\.py/);
      if (item.coverage === "partial") expect(item.note).toBeTruthy();
    }
  });

  it("counts coverage", () => {
    const counts = coverageCounts(SYLLABUS);
    expect(counts.total).toBe(REQUIRED.length);
    expect(counts.full + counts.partial).toBe(counts.total);
    expect(counts.partial).toBe(1);
  });
});
