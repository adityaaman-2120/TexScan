export interface Size {
  w: number;
  h: number;
}

/** The size of a frame scaled so its longest side is `side`, never upscaled (aspect ratio kept, even numbers not required). */
export function fitFrame(width: number, height: number, side: number): Size {
  const scale = Math.min(1, side / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which part of the picture is inspected: all of it, or its middle part (so the edge of the cloth is not judged). */
export type InspectArea = "full" | "center";
export const CENTER_FRACTION = 0.6;
export const centerFraction = (area: InspectArea): number => (area === "center" ? CENTER_FRACTION : 1);

/** The part of the received frame the server inspected (after trimming black bars and cropping to the centre), as fractions [x, y, w, h]. */
export type Region = readonly [number, number, number, number];
export const WHOLE_FRAME: Region = [0, 0, 1, 1];

/** That region in stage pixels. */
export function regionRect(region: Region, stage: Size): Rect {
  return { x: region[0] * stage.w, y: region[1] * stage.h, w: region[2] * stage.w, h: region[3] * stage.h };
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

/** Place a defect box from the working image (which covers `region`, in stage pixels) onto the stage, flipped for a mirrored preview. */
export function placeBox(box: Box, working: Size, region: Rect, stageWidth: number, mirror = false): Rect {
  const sx = region.w / working.w;
  const sy = region.h / working.h;
  const w = box[2] * sx;
  const x = region.x + box[0] * sx;
  return { x: mirror ? stageWidth - x - w : x, y: region.y + box[1] * sy, w, h: box[3] * sy };
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
  /** inspect only the middle part of the picture (1 = all of it) */
  center?: number;
}

/** wss:// on https pages, ws:// otherwise; goes through the dev proxy at /api. */
export function liveSocketUrl({ protocol, host, method, profileId, maxSide, center = 1 }: LiveSocketOptions): string {
  const params = new URLSearchParams({ method });
  if (profileId !== null) params.set("profile_id", String(profileId));
  else params.set("max_side", String(maxSide));
  if (center < 1) params.set("center", String(center));
  return `${protocol === "https:" ? "wss" : "ws"}://${host}/api/ws/live?${params}`;
}

/** Longest side of the JPEG sent to the server. The server trims and crops first and only then resizes to the working size, so this stays large enough to keep detail after the crop. */
export const UPLOAD_SIDE = 640;

export const MAX_RECONNECTS = 6;

/** Seconds to wait before reconnect attempt n (0-based): 1, 2, 4, 8, 8, ... */
export function backoffSeconds(attempt: number): number {
  return Math.min(8, 2 ** attempt);
}

/** Dim the overlay when no fresh result has arrived for this long. */
export const STALE_MS = 2500;
export const isStale = (lastResultAt: number | null, now: number, staleMs = STALE_MS): boolean => lastResultAt === null || now - lastResultAt > staleMs;
