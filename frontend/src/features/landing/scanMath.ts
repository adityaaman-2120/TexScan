/** Pure helpers for the hero photo: the scan beam's motion and where the marked defects sit on the picture. */

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

/** The hero photograph: a real piece of damaged fabric. */
export const PHOTO = { src: "/hero-fabric.jpg", width: 1672, height: 941 } as const;

export interface MarkedDefect {
  label: string;
  /** Position and size as fractions of the photo's width and height. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The three clearly visible defects in the photo, marked by hand (this is an illustration, not detector output). */
export const MARKED: MarkedDefect[] = [
  { label: "Hole", x: 752 / 1672, y: 586 / 941, w: 182 / 1672, h: 112 / 941 },
  { label: "Stain", x: 818 / 1672, y: 168 / 941, w: 76 / 1672, h: 80 / 941 },
  { label: "Tear", x: 1166 / 1672, y: 216 / 941, w: 30 / 1672, h: 72 / 941 },
];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How a picture is drawn to fill a canvas without stretching (CSS `object-fit: cover`): uniform scale, centred, overflow cropped. */
export function coverTransform(imageW: number, imageH: number, canvasW: number, canvasH: number): { scale: number; dx: number; dy: number } {
  const scale = Math.max(canvasW / imageW, canvasH / imageH);
  return { scale, dx: (canvasW - imageW * scale) / 2, dy: (canvasH - imageH * scale) / 2 };
}

/** Where a marked defect lands on the canvas. Boxes smaller than `minSize` grow around their centre, and stay inside the canvas. */
export function markedBox(defect: MarkedDefect, canvasW: number, canvasH: number, minSize = 0): Box {
  const { scale, dx, dy } = coverTransform(PHOTO.width, PHOTO.height, canvasW, canvasH);
  const w = Math.max(defect.w * PHOTO.width * scale, minSize);
  const h = Math.max(defect.h * PHOTO.height * scale, minSize);
  const cx = dx + (defect.x + defect.w / 2) * PHOTO.width * scale;
  const cy = dy + (defect.y + defect.h / 2) * PHOTO.height * scale;
  return {
    x: Math.min(Math.max(cx - w / 2, 0), Math.max(canvasW - w, 0)),
    y: Math.min(Math.max(cy - h / 2, 0), Math.max(canvasH - h, 0)),
    w,
    h,
  };
}
