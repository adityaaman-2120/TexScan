export interface Size {
  w: number;
  h: number;
}

/** The size of a frame scaled so its longest side is `side`, never upscaled (aspect ratio kept, even numbers not required). */
export function fitFrame(width: number, height: number, side: number): Size {
  const scale = Math.min(1, side / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/** A box in working-image pixels, as [x, y, width, height]. */
export type Box = readonly [number, number, number, number];

/** Map a defect box from the pipeline's working image onto the displayed canvas, optionally flipped for a mirrored preview. */
export function scaleBox(box: Box, from: Size, to: Size, mirror = false): { x: number; y: number; w: number; h: number } {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  const x = box[0] * sx;
  const w = box[2] * sx;
  return { x: mirror ? to.w - x - w : x, y: box[1] * sy, w, h: box[3] * sy };
}

/** Results per second over the most recent `windowMs`, from arrival timestamps (ms). */
export function fpsFrom(arrivals: number[], now: number, windowMs = 3000): number {
  const recent = arrivals.filter((t) => now - t <= windowMs);
  if (recent.length < 2) return 0;
  const span = (recent[recent.length - 1]! - recent[0]!) / 1000;
  return span > 0 ? (recent.length - 1) / span : 0;
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export interface LiveSocketOptions {
  protocol: string; // location.protocol
  host: string; // location.host
  method: string;
  profileId: number | null;
  /** longest side the server should work at; ignored (the profile decides) when a profile is used */
  maxSide: number;
}

/** wss:// on https pages, ws:// otherwise; goes through the dev proxy at /api. */
export function liveSocketUrl({ protocol, host, method, profileId, maxSide }: LiveSocketOptions): string {
  const params = new URLSearchParams({ method });
  if (profileId !== null) params.set("profile_id", String(profileId));
  else params.set("max_side", String(maxSide));
  return `${protocol === "https:" ? "wss" : "ws"}://${host}/api/ws/live?${params}`;
}

export const MAX_RECONNECTS = 6;

/** Seconds to wait before reconnect attempt n (0-based): 1, 2, 4, 8, 8, ... */
export function backoffSeconds(attempt: number): number {
  return Math.min(8, 2 ** attempt);
}

/** Dim the overlay when no fresh result has arrived for this long. */
export const STALE_MS = 2500;
export const isStale = (lastResultAt: number | null, now: number, staleMs = STALE_MS): boolean => lastResultAt === null || now - lastResultAt > staleMs;
