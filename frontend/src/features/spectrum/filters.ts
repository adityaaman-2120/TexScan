import type { SpectrumOut } from "@/api/types";

export type PresetKind = "none" | "lowpass" | "highpass" | "sharpen";
export type PresetResponse = "ideal" | "butterworth" | "gaussian";

export interface Preset {
  kind: PresetKind;
  response: PresetResponse;
  /** cutoff as a fraction of the largest radius in the spectrum (resolution independent) */
  cutoffFrac: number;
  order: number;
}

export const DEFAULT_PRESET: Preset = { kind: "none", response: "gaussian", cutoffFrac: 0.12, order: 2 };
export const SHARPEN_BOOST = 1.5;

/** Cutoff radius in spectrum pixels for a given size. */
export const cutoffPx = (frac: number, size: number): number => Math.max(1, frac * (size / 2));

/** Gain of a radial filter at distance d from the DC bin; mirrors backend/texscan/pipeline/notch.py::radial_filter. */
export function radialGain(preset: Pick<Preset, "kind" | "response" | "order">, cutoff: number, d: number, boost = SHARPEN_BOOST): number {
  const low =
    preset.response === "ideal" ? (d <= cutoff ? 1 : 0) : preset.response === "butterworth" ? 1 / (1 + (d / cutoff) ** (2 * preset.order)) : Math.exp(-(d * d) / (2 * cutoff * cutoff));
  if (preset.kind === "none") return 1;
  if (preset.kind === "lowpass") return low;
  const high = 1 - low;
  return preset.kind === "highpass" ? high : 1 + boost * high;
}

/* ---- peaks ------------------------------------------------------------------------------------ */

export interface Point {
  x: number;
  y: number;
}

export interface PeakPair {
  /** stable id: the canonical (upper-left-most) member as "x,y" */
  id: string;
  a: Point;
  /** the point mirror image through the DC bin */
  b: Point;
  /** offset of `a` from the centre, in cycles per image */
  dx: number;
  dy: number;
  /** approximate period of the pattern in image pixels */
  period: number;
}

/** Centre bin of a shifted spectrum, matching the backend (index // 2). */
export const centre = (w: number, h: number): Point => ({ x: Math.floor(w / 2), y: Math.floor(h / 2) });

/** Mirror a pixel index through the DC bin: (x, y) -> (2*cx - x, 2*cy - y). */
export function mirrorIndex(p: Point, w: number, h: number): Point {
  const c = centre(w, h);
  return { x: 2 * c.x - p.x, y: 2 * c.y - p.y };
}

/** Mirror a continuous canvas coordinate; pixel centres sit at index + 0.5, so mirrors land on the server's pixels. */
export function mirrorCanvas(p: Point, w: number, h: number): Point {
  const c = centre(w, h);
  return { x: 2 * c.x + 1 - p.x, y: 2 * c.y + 1 - p.y };
}

const keyOf = (p: Point): string => `${p.x},${p.y}`;

/** Group detected peaks into conjugate pairs (a peak and its mirror are one feature of the image). */
export function pairPeaks(peaks: SpectrumOut["peaks"], w: number, h: number): PeakPair[] {
  const seen = new Set<string>();
  const pairs: PeakPair[] = [];
  for (const { x, y } of peaks) {
    const p = { x, y };
    const m = mirrorIndex(p, w, h);
    const [a, b] = m.y < p.y || (m.y === p.y && m.x < p.x) ? [m, p] : [p, m]; // canonical member first
    const id = keyOf(a);
    if (seen.has(id)) continue;
    seen.add(id);
    const c = centre(w, h);
    const dx = a.x - c.x;
    const dy = a.y - c.y;
    pairs.push({ id, a, b, dx, dy, period: Math.min(w, h) / Math.hypot(dx, dy) });
  }
  return pairs;
}

/** Map a pointer position to canvas pixel coordinates when the canvas is displayed scaled. */
export function canvasPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, canvasW: number, canvasH: number): Point {
  return { x: ((clientX - rect.left) / rect.width) * canvasW, y: ((clientY - rect.top) / rect.height) * canvasH };
}
