export interface Point {
  x: number;
  y: number;
}

export type LengthUnit = "mm" | "cm" | "in";

export const UNIT_TO_MM: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4 };

/** A typed length as millimetres; null when it is not a positive number. */
export function toMm(value: string, unit: LengthUnit): number | null {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n * UNIT_TO_MM[unit] : null;
}

/** Map a click inside a displayed image (its on-screen rectangle) to pixel coordinates of the full-size image. */
export function clickToImage(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, naturalWidth: number, naturalHeight: number): Point {
  const fx = (clientX - rect.left) / Math.max(rect.width, 1);
  const fy = (clientY - rect.top) / Math.max(rect.height, 1);
  return { x: Math.min(naturalWidth, Math.max(0, fx * naturalWidth)), y: Math.min(naturalHeight, Math.max(0, fy * naturalHeight)) };
}

export function pixelDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Pixels per millimetre implied by two clicked points and their real distance; null until both exist. */
export function pixelsPerMm(points: Point[], distanceMm: number | null): number | null {
  if (points.length < 2 || distanceMm == null) return null;
  const px = pixelDistance(points[0]!, points[1]!);
  return px > 0 ? px / distanceMm : null;
}

/** A third click starts over with that point; the first two fill the pair. */
export function nextPoints(points: Point[], clicked: Point): Point[] {
  return points.length >= 2 ? [clicked] : [...points, clicked];
}
