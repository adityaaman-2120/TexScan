import { describe, expect, it } from "vitest";
import type { Defect } from "@/api/types";
import { describeSize, formatNumber, isMeasured, pixelSize, sizeCells } from "./defectSize";

const defect = (over: Partial<Defect> = {}): Defect =>
  ({ id: 1, bbox: [10, 20, 40, 8], area: 250, centroid: [30, 24], perimeter: 90, aspect_ratio: 5, solidity: 0.9, orientation_deg: 0, ...over }) as Defect;

const measured = defect({ length_px: 400, width_px: 3, length_mm: 200.4, width_mm: 1.5, area_mm2: 301.2, length_in: 7.89, width_in: 0.06, area_in2: 0.4668 });

describe("formatNumber", () => {
  it("uses fewer decimals as the number grows", () => {
    expect(formatNumber(1.5)).toBe("1.50");
    expect(formatNumber(62.44)).toBe("62.4");
    expect(formatNumber(1234.6)).toBe("1,235");
  });
});

describe("sizeCells", () => {
  it("shows mm with inches underneath when the defect is measured", () => {
    const c = sizeCells(measured);
    expect(c.length).toEqual({ main: "200 mm", alt: "7.89 in" });
    expect(c.width).toEqual({ main: "1.50 mm", alt: "0.06 in" });
    expect(c.area).toEqual({ main: "301 mm²", alt: "0.47 in²" });
  });

  it("falls back to pixels without a second line when it is not", () => {
    const c = sizeCells(defect({ length_px: 41.2, width_px: 8.4 }));
    expect(c.length).toEqual({ main: "41 px" });
    expect(c.width).toEqual({ main: "8 px" });
    expect(c.area).toEqual({ main: "250 px²" });
  });
});

describe("pixelSize / isMeasured", () => {
  it("uses the bounding box for inspections stored before sizes existed", () => {
    expect(pixelSize(defect())).toEqual({ length: 40, width: 8 });
    expect(pixelSize(defect({ length_px: 41, width_px: 7 }))).toEqual({ length: 41, width: 7 });
  });

  it("needs all three real-world values to count as measured", () => {
    expect(isMeasured(measured)).toBe(true);
    expect(isMeasured(defect({ length_mm: 5 }))).toBe(false);
  });
});

describe("describeSize", () => {
  it("reads as a sentence in both units when measured", () => {
    const d = describeSize(measured);
    expect(d.main).toBe("200 mm long × 1.50 mm wide");
    expect(d.alt).toBe("7.89 × 0.06 in · 301 mm² (0.47 in²)");
  });

  it("is pixels only when not measured", () => {
    expect(describeSize(defect({ length_px: 41.2, width_px: 8.4 }))).toEqual({ main: "41 px long × 8 px wide" });
  });
});
