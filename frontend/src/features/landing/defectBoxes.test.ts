import { describe, expect, it } from "vitest";
import { enclosing, groupByProximity, padBox, reasonOf, ringContrast } from "./defectBoxes";

describe("groupByProximity", () => {
  const slit = [
    { x: 227, y: 200, w: 28, h: 40 },
    { x: 235, y: 269, w: 33, h: 37 },
  ];

  it("joins regions that are close together, and keeps far ones apart", () => {
    expect(groupByProximity(slit, 40)).toEqual([[0, 1]]);
    expect(groupByProximity(slit, 10)).toEqual([[0], [1]]);
    expect(groupByProximity([...slit, { x: 400, y: 20, w: 10, h: 10 }], 40)).toEqual([[0, 1], [2]]);
  });

  it("joins through a chain, and treats overlapping boxes as touching", () => {
    const chain = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 30, y: 0, w: 10, h: 10 },
      { x: 60, y: 0, w: 10, h: 10 },
    ];
    expect(groupByProximity(chain, 25)).toEqual([[0, 1, 2]]);
    expect(groupByProximity([{ x: 0, y: 0, w: 20, h: 20 }, { x: 5, y: 5, w: 20, h: 20 }], 0)).toEqual([[0, 1]]);
  });

  it("handles no regions", () => {
    expect(groupByProximity([], 40)).toEqual([]);
  });
});

describe("enclosing", () => {
  it("is the smallest box holding all of them", () => {
    expect(enclosing([{ x: 227, y: 200, w: 28, h: 40 }, { x: 235, y: 269, w: 33, h: 37 }])).toEqual({ x: 227, y: 200, w: 41, h: 106 });
  });
});

describe("padBox", () => {
  it("grows a box by a share of its size, at least minPad", () => {
    const b = padBox({ x: 200, y: 200, w: 100, h: 10 }, 512, 512, 14, 0.3);
    expect(b).toEqual({ x: 170, y: 186, w: 160, h: 38 });
  });

  it("never leaves the picture", () => {
    const b = padBox({ x: 2, y: 500, w: 40, h: 10 }, 512, 512);
    expect(b.x).toBe(0);
    expect(b.y + b.h).toBeLessThanOrEqual(512);
    expect(b.x + b.w).toBeLessThanOrEqual(512);
  });
});

describe("reasonOf", () => {
  it("says how the region differs from its surroundings", () => {
    expect(reasonOf({ contrast: -40, aspect_ratio: 1.2, solidity: 0.9 })).toBe("Much darker than the cloth around it; compact.");
    expect(reasonOf({ contrast: -10, aspect_ratio: 1.2, solidity: 0.9 })).toMatch(/^Darker/);
    expect(reasonOf({ contrast: 30, aspect_ratio: 1.2, solidity: 0.9 })).toMatch(/^Much lighter/);
    expect(reasonOf({ contrast: 10, aspect_ratio: 1.2, solidity: 0.9 })).toMatch(/^Lighter/);
  });

  it("falls back to texture when the contrast is small or unknown", () => {
    expect(reasonOf({ contrast: 2, aspect_ratio: 1.2, solidity: 0.9 })).toMatch(/^The weave is disturbed/);
    expect(reasonOf({ contrast: null, aspect_ratio: 1.2, solidity: 0.9 })).toMatch(/^The weave is disturbed/);
  });

  it("describes the shape", () => {
    expect(reasonOf({ contrast: -40, aspect_ratio: 4, solidity: 0.9 })).toMatch(/long and narrow\.$/);
    expect(reasonOf({ contrast: -40, aspect_ratio: 1.5, solidity: 0.5 })).toMatch(/ragged-edged\.$/);
  });
});

describe("ringContrast", () => {
  const picture = (inside: number, outside: number) => {
    const width = 60;
    const height = 60;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x >= 20 && x < 40 && y >= 20 && y < 40 ? inside : outside;
        data.set([v, v, v, 255], (y * width + x) * 4);
      }
    }
    return { data, width, height };
  };
  const box = { x: 20, y: 20, w: 20, h: 20 };

  it("is negative for a dark patch, positive for a light one, and zero on flat cloth", () => {
    expect(ringContrast(picture(40, 140), box)).toBeCloseTo(-100, 5);
    expect(ringContrast(picture(190, 140), box)).toBeCloseTo(50, 5);
    expect(ringContrast(picture(120, 120), box)).toBeCloseTo(0, 5);
  });

  it("copes with a box at the picture's edge", () => {
    expect(ringContrast(picture(40, 140), { x: 0, y: 0, w: 10, h: 10 }, 5)).toBeCloseTo(0, 5);
    expect(ringContrast(picture(40, 140), { x: 100, y: 100, w: 5, h: 5 })).toBeNull();
  });
});
