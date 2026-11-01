import type { Defect } from "@/api/types";

/** A value with an optional second line (the same size in the other unit). */
export interface SizeCell {
  main: string;
  alt?: string;
}

export interface SizeCells {
  length: SizeCell;
  width: SizeCell;
  area: SizeCell;
}

/** Short number for display: two decimals under 10, one under 100, whole numbers above. */
export function formatNumber(value: number): string {
  const v = Math.abs(value);
  if (v < 10) return value.toFixed(2);
  if (v < 100) return value.toFixed(1);
  return Math.round(value).toLocaleString("en-US");
}

/** True when the defect carries real-world sizes (its profile was calibrated). */
export function isMeasured(d: Defect): boolean {
  return d.length_mm != null && d.width_mm != null && d.area_mm2 != null;
}

/** Pixel length and width of a defect; older stored inspections without them fall back to the bounding box. */
export function pixelSize(d: Defect): { length: number; width: number } {
  if (d.length_px != null && d.width_px != null) return { length: d.length_px, width: d.width_px };
  return { length: Math.max(d.bbox[2], d.bbox[3]), width: Math.min(d.bbox[2], d.bbox[3]) };
}

/** Length, width and area as table cells: mm with inches underneath when calibrated, otherwise pixels. */
export function sizeCells(d: Defect): SizeCells {
  if (isMeasured(d)) {
    return {
      length: { main: `${formatNumber(d.length_mm!)} mm`, alt: `${formatNumber(d.length_in!)} in` },
      width: { main: `${formatNumber(d.width_mm!)} mm`, alt: `${formatNumber(d.width_in!)} in` },
      area: { main: `${formatNumber(d.area_mm2!)} mm²`, alt: `${formatNumber(d.area_in2!)} in²` },
    };
  }
  const px = pixelSize(d);
  return {
    length: { main: `${Math.round(px.length)} px` },
    width: { main: `${Math.round(px.width)} px` },
    area: { main: `${d.area.toLocaleString("en-US")} px²` },
  };
}

/** One readable sentence-fragment for operator views, e.g. "62.4 mm long × 3.10 mm wide" and "2.46 × 0.12 in · 193 mm²". */
export function describeSize(d: Defect): { main: string; alt?: string } {
  const c = sizeCells(d);
  const main = `${c.length.main} long × ${c.width.main} wide`;
  if (!isMeasured(d)) return { main };
  return { main, alt: `${formatNumber(d.length_in!)} × ${formatNumber(d.width_in!)} in · ${c.area.main} (${c.area.alt})` };
}
