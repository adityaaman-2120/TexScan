export interface View {
  scale: number;
  /** translation of the image origin, in container pixels */
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 40;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Largest scale that fits the whole image in the container, centred. */
export function fitView(cw: number, ch: number, w: number, h: number, margin = 0.96): View {
  const scale = clamp(Math.min(cw / w, ch / h) * margin, MIN_SCALE, MAX_SCALE);
  return { scale, x: (cw - w * scale) / 2, y: (ch - h * scale) / 2 };
}

/** Zoom by `factor` keeping the image point under (cx, cy) (container px) fixed. */
export function zoomAround(view: View, factor: number, cx: number, cy: number): View {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const k = scale / view.scale;
  return { scale, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k };
}

/** View that centres `rect` (image px) with breathing room; never zooms past `maxScale`. */
export function viewForRect(cw: number, ch: number, rect: Rect, padding = 0.6, maxScale = 12): View {
  const padX = Math.max(rect.w * padding, 24);
  const padY = Math.max(rect.h * padding, 24);
  const pw = rect.w + 2 * padX;
  const ph = rect.h + 2 * padY;
  const scale = clamp(Math.min(cw / pw, ch / ph), MIN_SCALE, maxScale);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { scale, x: cw / 2 - cx * scale, y: ch / 2 - cy * scale };
}

export function bboxToRect(bbox: readonly [number, number, number, number]): Rect {
  return { x: bbox[0], y: bbox[1], w: bbox[2], h: bbox[3] };
}
