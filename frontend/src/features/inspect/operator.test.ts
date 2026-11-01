import { describe, expect, it } from "vitest";
import type { Defect } from "@/api/types";
import { formatShare, locationName, share, sizeClass, toOperatorDefects } from "./operator";

describe("sizeClass", () => {
  it("is relative to the picture, not absolute pixels", () => {
    expect(sizeClass(20, 100, 100)).toBe("Small"); // 0.2%
    expect(sizeClass(100, 100, 100)).toBe("Medium"); // 1%
    expect(sizeClass(300, 100, 100)).toBe("Large"); // 3%
    expect(sizeClass(20, 10, 10)).toBe("Large"); // the same 20 px is 20% of a tiny picture
  });

  it("puts the boundaries in the larger class", () => {
    expect(sizeClass(50, 100, 100)).toBe("Medium"); // exactly 0.5%
    expect(sizeClass(200, 100, 100)).toBe("Large"); // exactly 2%
  });
});

describe("share / formatShare", () => {
  it("is zero for an empty picture", () => {
    expect(share(10, 0, 0)).toBe(0);
  });

  it("shows one decimal below 10%, whole numbers above, and never a misleading zero", () => {
    expect(formatShare(1.234)).toBe("1.2%");
    expect(formatShare(12.6)).toBe("13%");
    expect(formatShare(0.04)).toBe("<0.1%");
  });
});

describe("locationName", () => {
  const at = (x: number, y: number) => locationName([x, y, 10, 10], 100, 100);

  it("names the nine cells of the picture", () => {
    expect(at(0, 0)).toBe("Top left");
    expect(at(45, 0)).toBe("Top");
    expect(at(90, 0)).toBe("Top right");
    expect(at(0, 45)).toBe("Left");
    expect(at(45, 45)).toBe("Center");
    expect(at(90, 45)).toBe("Right");
    expect(at(0, 90)).toBe("Bottom left");
    expect(at(45, 90)).toBe("Bottom");
    expect(at(90, 90)).toBe("Bottom right");
  });

  it("uses the centre of the box and stays inside the grid at the far edge", () => {
    expect(locationName([0, 0, 100, 100], 100, 100)).toBe("Center");
    expect(locationName([95, 95, 5, 5], 100, 100)).toBe("Bottom right");
  });

  it("copes with a non-square picture", () => {
    expect(locationName([300, 10, 20, 20], 400, 100)).toBe("Top right");
  });
});

describe("toOperatorDefects", () => {
  const defect = (over: Partial<Defect>): Defect => ({ id: 1, bbox: [0, 0, 10, 10], area: 100, defect_type: "hole", ...over }) as Defect;

  it("turns defects into shop-floor words", () => {
    const [row] = toOperatorDefects([defect({ id: 3, bbox: [90, 90, 10, 10], area: 300, defect_type: "stain" })], 100, 100);
    expect(row).toEqual({ id: 3, type: "Stain", size: "Large", share: "3.0%", location: "Bottom right" });
  });

  it("labels an unclassified defect as Unknown", () => {
    expect(toOperatorDefects([defect({ defect_type: null })], 100, 100)[0]!.type).toBe("Unknown");
  });
});
