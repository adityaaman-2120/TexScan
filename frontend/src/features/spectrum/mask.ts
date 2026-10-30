import type { PeakPair } from "./filters";

export function newCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/**
 * The reject mask the server expects: white where frequencies are rejected, black elsewhere.
 * It is the enabled peak discs (both halves of each conjugate pair) plus the user's brush strokes.
 */
export function composeMask(w: number, h: number, paint: HTMLCanvasElement | null, pairs: PeakPair[], enabled: ReadonlySet<string>, peakRadius: number): HTMLCanvasElement {
  const canvas = newCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  for (const pair of pairs) {
    if (!enabled.has(pair.id)) continue;
    for (const p of [pair.a, pair.b]) {
      ctx.beginPath();
      ctx.arc(p.x + 0.5, p.y + 0.5, peakRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (paint) ctx.drawImage(paint, 0, 0);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not encode the mask"))), "image/png"));
}
