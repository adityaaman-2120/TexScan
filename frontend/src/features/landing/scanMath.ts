/** Pure helpers for the hero cloth: the scan beam's motion and where the planted defects sit. */

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** A smooth back-and-forth sweep from 0 to 1 and back. `period` is the length of the whole round trip in seconds; it eases at both ends. */
export function pingPong(seconds: number, period = 10): number {
  const phase = (((seconds % period) + period) % period) / period;
  const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  return triangle * triangle * (3 - 2 * triangle);
}

/** The time within a sweep (rising half) at which `pingPong` equals `position`, so an automatic sweep can pick up where the pointer left the beam. */
export function invertPingPong(position: number, period = 10): number {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (pingPong(mid * period, period) < position) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * period;
}

/** Move `current` toward `target`, covering a fixed share of the remaining distance per second (frame-rate independent). */
export function stepToward(current: number, target: number, dtSeconds: number, rate = 9): number {
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dtSeconds)));
}

export type SpotKind = "hole" | "stain" | "thread";

export interface Spot {
  kind: SpotKind;
  label: string;
  /** Centre, as fractions of the cloth's width and height. */
  cx: number;
  cy: number;
  /** Half the size, as a fraction of the cloth's height (for a thread: of its length's half-height). */
  r: number;
  /** Half-length of a thread as a fraction of the width. */
  halfLength?: number;
}

export const SPOTS: Spot[] = [
  { kind: "hole", label: "Hole", cx: 0.3, cy: 0.33, r: 0.075 },
  { kind: "stain", label: "Stain", cx: 0.73, cy: 0.58, r: 0.12 },
  { kind: "thread", label: "Pulled thread", cx: 0.4, cy: 0.83, r: 0.024, halfLength: 0.26 },
];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The box a spot occupies on a cloth of the given size, with a little breathing room. */
export function spotBox(spot: Spot, width: number, height: number, pad = 0.012): Box {
  const halfW = (spot.kind === "thread" ? (spot.halfLength ?? 0.2) * width : spot.r * height) + pad * height;
  const halfH = spot.r * height + pad * height;
  return { x: spot.cx * width - halfW, y: spot.cy * height - halfH, w: halfW * 2, h: halfH * 2 };
}
