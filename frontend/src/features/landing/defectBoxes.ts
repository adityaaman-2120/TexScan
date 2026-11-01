/** Pure helpers that turn the detector's regions into red boxes with a written reason, for the landing-page demo. */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** Gap between two boxes along each axis (0 when they overlap on that axis); the larger of the two. */
function gapBetween(a: Box, b: Box): number {
  const gx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const gy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.max(gx, gy);
}

/** Group regions that lie within `gap` pixels of each other (directly or through a chain), so one damaged spot gets one box. Returns index groups in first-seen order. */
export function groupByProximity(boxes: readonly Box[], gap: number): number[][] {
  const group = boxes.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i]!)));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (gapBetween(boxes[i]!, boxes[j]!) <= gap) group[root(j)] = root(i);
    }
  }
  const byRoot = new Map<number, number[]>();
  boxes.forEach((_, i) => byRoot.set(root(i), [...(byRoot.get(root(i)) ?? []), i]));
  return [...byRoot.values()];
}

/** The box around a set of regions. */
export function enclosing(boxes: readonly Box[]): Box {
  return boxes.reduce((acc, b) => union(acc, b));
}

/** Grow a box so it reads as a marker around the defect rather than a tight crop: a share of its size, never less than `minPad`, kept inside the picture. */
export function padBox(box: Box, width: number, height: number, minPad = 14, share = 0.3): Box {
  const px = Math.max(minPad, box.w * share);
  const py = Math.max(minPad, box.h * share);
  const x = Math.max(0, box.x - px);
  const y = Math.max(0, box.y - py);
  return { x, y, w: Math.min(width, box.x + box.w + px) - x, h: Math.min(height, box.y + box.h + py) - y };
}

export interface RegionFacts {
  /** Mean gray inside minus mean gray of the ring around it; null when unknown. */
  contrast?: number | null;
  aspect_ratio: number;
  solidity: number;
}

/** Why a region was flagged, in plain words, from what was measured: how it differs from the cloth around it, and its shape. */
export function reasonOf(r: RegionFacts): string {
  const c = r.contrast;
  let tone = "The weave is disturbed: its texture differs from the cloth around it, with little change in brightness";
  if (c != null) {
    if (c <= -20) tone = "Much darker than the cloth around it";
    else if (c <= -8) tone = "Darker than the cloth around it";
    else if (c >= 20) tone = "Much lighter than the cloth around it";
    else if (c >= 8) tone = "Lighter than the cloth around it";
  }
  const shape = r.aspect_ratio >= 2.5 ? "long and narrow" : r.solidity < 0.7 ? "ragged-edged" : "compact";
  return `${tone}; ${shape}.`;
}

/** Pixels as RGBA, row by row (the shape of `ImageData`). */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/**
 * How much darker (negative) or lighter (positive) the inside of `box` is than a ring of the same width around it,
 * in gray levels: mean luma inside minus mean luma of the ring. Returns null when the ring falls outside the picture.
 */
export function ringContrast(px: Pixels, box: Box, ring = 14): number | null {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(px.width, Math.ceil(box.x + box.w));
  const y1 = Math.min(px.height, Math.ceil(box.y + box.h));
  let inside = 0;
  let nInside = 0;
  let around = 0;
  let nAround = 0;
  for (let y = Math.max(0, y0 - ring); y < Math.min(px.height, y1 + ring); y++) {
    for (let x = Math.max(0, x0 - ring); x < Math.min(px.width, x1 + ring); x++) {
      const i = (y * px.width + x) * 4;
      const luma = 0.299 * px.data[i]! + 0.587 * px.data[i + 1]! + 0.114 * px.data[i + 2]!;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        inside += luma;
        nInside++;
      } else {
        around += luma;
        nAround++;
      }
    }
  }
  return nInside === 0 || nAround === 0 ? null : inside / nInside - around / nAround;
}
