import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navGroups, paletteItems, sidebarItems } from "./nav";

const labels = (engineering: boolean) => navGroups(engineering).flatMap((g) => sidebarItems(g, engineering).map((i) => i.label));

describe("navigation", () => {
  it("lists exactly the product pages, in order, in product mode", () => {
    expect(labels(false)).toEqual(["Inspect", "Live", "Roll Inspection", "History", "Reports", "Dashboard", "Profiles"]);
  });

  it("adds the Engineering section, and only it, in engineering mode", () => {
    expect(labels(true)).toEqual([...labels(false), "Pipeline X-Ray", "Spectrum Studio", "Method Arena", "Robustness Lab", "Bit-Plane viewer"]);
    expect(navGroups(true).at(-1)).toBe("Engineering");
  });

  it("keeps Batch reachable from the palette but out of the sidebar", () => {
    expect(labels(true)).not.toContain("Batch");
    expect(paletteItems(false).map((i) => i.label)).toContain("Batch");
  });

  it("keeps engineering pages out of the palette in product mode", () => {
    expect(paletteItems(false).some((i) => i.engineering)).toBe(false);
    expect(paletteItems(true).filter((i) => i.engineering)).toHaveLength(5);
  });

  it("has unique paths", () => {
    expect(new Set(NAV_ITEMS.map((i) => i.path)).size).toBe(NAV_ITEMS.length);
  });

  it("uses no technical words in anything an operator can see", () => {
    const banned = /fft|fourier|bit.?plane|syllabus|\blab\b|spectrum|notch|gabor|frequency|morpholog/i;
    for (const item of NAV_ITEMS.filter((i) => !i.engineering)) {
      expect(`${item.label} ${item.description} ${item.keywords.join(" ")}`).not.toMatch(banned);
    }
  });
});
