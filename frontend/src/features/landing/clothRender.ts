import { coverTransform, MARKED, markedBox } from "./scanMath";

/** Draws the hero photo and its "scanned" twin with the marked defects outlined. Canvas only; the marks are placed by hand, not detected. */

const ALERT = "#ff6b63";

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })!];
}

/** The photograph, scaled to fill the canvas without stretching (centred, overflow cropped). */
export function renderPhoto(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const [canvas, ctx] = canvasOf(width, height);
  ctx.fillStyle = "#05070b";
  ctx.fillRect(0, 0, width, height);
  const { scale, dx, dy } = coverTransform(image.naturalWidth, image.naturalHeight, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, dx, dy, image.naturalWidth * scale, image.naturalHeight * scale);
  return canvas;
}

function bracketBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dpr: number): void {
  const t = Math.min(w, h) * 0.26;
  ctx.strokeStyle = ALERT;
  ctx.lineWidth = 2 * dpr;
  ctx.lineCap = "square";
  ctx.beginPath();
  for (const [px, py, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as const) {
    ctx.moveTo(px + dx * t, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + dy * t);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,107,99,0.32)";
  ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(x, y, w, h);
}

function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dpr: number): void {
  ctx.font = `600 ${10.5 * dpr}px "JetBrains Mono Variable", ui-monospace, monospace`;
  const padX = 7 * dpr;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 19 * dpr;
  ctx.fillStyle = "rgba(8,11,16,0.92)";
  ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = ALERT;
  ctx.fillRect(x, y - h, 2 * dpr, h);
  ctx.fillStyle = "#ffc2bd";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y - h / 2);
}

/** The same photo as a scanner would show it: cool monochrome, a measuring grid, and every marked defect outlined and named. */
export function renderScanned(raw: HTMLCanvasElement, dpr: number): HTMLCanvasElement {
  const { width, height } = raw;
  const [canvas, ctx] = canvasOf(width, height);
  ctx.drawImage(raw, 0, 0);
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(1, ((0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / 255) * 1.25);
    d[i] = 8 + 46 * v;
    d[i + 1] = 20 + 150 * v;
    d[i + 2] = 32 + 168 * v;
  }
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = "rgba(150,232,248,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 56 * dpr;
  for (let x = step; x < width; x += step) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  for (let y = step; y < height; y += step) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
  }
  ctx.stroke();

  for (const defect of MARKED) {
    const b = markedBox(defect, width, height, 44 * dpr);
    bracketBox(ctx, b.x, b.y, b.w, b.h, dpr);
    chip(ctx, defect.label.toUpperCase(), b.x, Math.max(b.y - 2 * dpr, 19 * dpr), dpr);
  }
  return canvas;
}
