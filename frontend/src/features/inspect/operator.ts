import type { Defect } from "@/api/types";
import { DEFECT_LABELS } from "./defectLabels";

export type SizeClass = "Small" | "Medium" | "Large";

export interface OperatorDefect {
  id: number;
  /** What it looks like, in shop-floor words. */
  type: string;
  size: SizeClass;
  /** Share of the picture it covers, e.g. "1.2%". */
  share: string;
  /** Where it is, e.g. "Top left". */
  location: string;
}

const SMALL_BELOW = 0.5; // percent of the picture
const LARGE_FROM = 2;

/** Small / Medium / Large by how much of the picture the defect covers. */
export function sizeClass(areaPx: number, width: number, height: number): SizeClass {
  const percent = share(areaPx, width, height);
  return percent < SMALL_BELOW ? "Small" : percent < LARGE_FROM ? "Medium" : "Large";
}

/** Percent of the picture a defect covers (0 for an empty picture). */
export function share(areaPx: number, width: number, height: number): number {
  return width > 0 && height > 0 ? (areaPx / (width * height)) * 100 : 0;
}

export function formatShare(percent: number): string {
  if (percent > 0 && percent < 0.1) return "<0.1%";
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}

const ROWS = ["Top", "Middle", "Bottom"] as const;
const COLS = ["left", "center", "right"] as const;

/** Where the centre of a bounding box [x, y, w, h] falls on a 3 x 3 grid over the picture ("Top left", "Center", ...). */
export function locationName(bbox: readonly number[], width: number, height: number): string {
  const [x = 0, y = 0, w = 0, h = 0] = bbox;
  const cell = (centre: number, extent: number): number => Math.min(2, Math.max(0, Math.floor((centre / Math.max(extent, 1)) * 3)));
  const row = ROWS[cell(y + h / 2, height)]!;
  const col = COLS[cell(x + w / 2, width)]!;
  if (row === "Middle" && col === "center") return "Center";
  if (row === "Middle") return `${col[0]!.toUpperCase()}${col.slice(1)}`;
  return col === "center" ? row : `${row} ${col}`;
}

export function toOperatorDefects(defects: Defect[], width: number, height: number): OperatorDefect[] {
  return defects.map((d) => ({
    id: d.id,
    type: DEFECT_LABELS[d.defect_type ?? "unknown"],
    size: sizeClass(d.area, width, height),
    share: formatShare(share(d.area, width, height)),
    location: locationName(d.bbox, width, height),
  }));
}
