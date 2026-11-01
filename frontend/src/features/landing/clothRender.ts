import { SPOTS, spotBox, type Spot } from "./scanMath";

/** Draws the hero cloth: a fine plain weave with planted defects, and its "scanned" twin with the defects outlined. Canvas only; nothing here is data. */

const CELL = 6.5; // css px per thread crossing
const WARP: [number, number, number] = [42, 56, 96]; // vertical threads
const WEFT: [number, number, number] = [54, 70, 114]; // horizontal threads
const ALERT = "#ff6b63";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (c: [number, number, number], k: number, a = 1): string => `rgba(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0},${a})`;

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })!];
}

/** A plain weave: every crossing is one thread passing over the other, lit from the upper left so each looks round. */
function weave(ctx: CanvasRenderingContext2D, w: number, h: number, cell: number, rand: () => number): void {
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const warpTone = Array.from({ length: cols }, () => 0.9 + 0.2 * rand());
  const weftTone = Array.from({ length: rows }, () => 0.9 + 0.2 * rand());
  const edge = Math.max(1, Math.round(cell * 0.14));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cell;
      const y = j * cell;
      if ((i + j) % 2 === 0) {
        ctx.fillStyle = rgb(WARP, warpTone[i]!);
        ctx.fillRect(x, y, cell, cell);
        ctx.fillStyle = "rgba(0,0,0,0.20)"; // the sides of a round thread fall away
        ctx.fillRect(x, y, cell * 0.22, cell);
        ctx.fillRect(x + cell * 0.78, y, cell * 0.22, cell);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x + cell * 0.36, y, cell * 0.26, cell);
        ctx.fillStyle = "rgba(0,0,0,0.34)"; // it dives under the next thread
        ctx.fillRect(x, y + cell - edge, cell, edge);
      } else {
        ctx.fillStyle = rgb(WEFT, weftTone[j]!);
        ctx.fillRect(x, y, cell, cell);
        ctx.fillStyle = "rgba(0,0,0,0.20)";
        ctx.fillRect(x, y, cell, cell * 0.22);
        ctx.fillRect(x, y + cell * 0.78, cell, cell * 0.22);
        ctx.fillStyle = "rgba(255,255,255,0.09)";
        ctx.fillRect(x, y + cell * 0.36, cell, cell * 0.26);
        ctx.fillStyle = "rgba(0,0,0,0.34)";
        ctx.fillRect(x + cell - edge, y, edge, cell);
      }
    }
  }
  // light from the upper left and a gentle fall-off toward the lower right
  const light = ctx.createLinearGradient(0, 0, w, h);
  light.addColorStop(0, "rgba(255,255,255,0.11)");
  light.addColorStop(0.55, "rgba(255,255,255,0)");
  light.addColorStop(1, "rgba(0,0,0,0.26)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
}

/** A closed, smooth, slightly irregular blob: points around a circle with jittered radius, joined by curves through their midpoints. */
function ragged(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number, steps = 16, jitter = 0.2): void {
  const pts = Array.from({ length: steps }, (_, s) => {
    const a = (s / steps) * Math.PI * 2;
    const rr = r * (1 - jitter / 2 + jitter * rand());
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9] as const;
  });
  const mid = (i: number, j: number): [number, number] => [(pts[i]![0] + pts[j]![0]) / 2, (pts[i]![1] + pts[j]![1]) / 2];
  ctx.beginPath();
  const [sx, sy] = mid(steps - 1, 0);
  ctx.moveTo(sx, sy);
  for (let i = 0; i < steps; i++) {
    const [mx, my] = mid(i, (i + 1) % steps);
    ctx.quadraticCurveTo(pts[i]![0], pts[i]![1], mx, my);
  }
  ctx.closePath();
}

function drawHole(ctx: CanvasRenderingContext2D, spot: Spot, w: number, h: number, dpr: number, rand: () => number): void {
  const cx = spot.cx * w;
  const cy = spot.cy * h;
  const r = spot.r * h;
  // the cloth puckers a little around a hole
  const pucker = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 2.1);
  pucker.addColorStop(0, "rgba(255,255,255,0.10)");
  pucker.addColorStop(0.5, "rgba(0,0,0,0.14)");
  pucker.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = pucker;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
  ctx.fill();
  // the opening
  ragged(ctx, cx, cy, r, rand, 15, 0.2);
  const depth = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r);
  depth.addColorStop(0, "#090d16");
  depth.addColorStop(1, "#02040a");
  ctx.fillStyle = depth;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 2.4 * dpr;
  ctx.stroke();
  // broken yarn ends around the rim
  ctx.lineCap = "round";
  for (let n = 0; n < 12; n++) {
    const a = (n / 12) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const len = r * (0.28 + 0.34 * rand());
    const inward = n % 3 === 0;
    const x0 = cx + Math.cos(a) * r * 0.98;
    const y0 = cy + Math.sin(a) * r * 0.98;
    const dir = inward ? -1 : 1;
    ctx.strokeStyle = rgb(n % 2 ? WARP : WEFT, 1.45, 0.92);
    ctx.lineWidth = (1.1 + rand() * 0.7) * dpr;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + dir * Math.cos(a + 0.5) * len * 0.6, y0 + dir * Math.sin(a + 0.5) * len * 0.6, x0 + dir * Math.cos(a) * len, y0 + dir * Math.sin(a) * len);
    ctx.stroke();
  }
}

function drawStain(ctx: CanvasRenderingContext2D, spot: Spot, w: number, h: number, rand: () => number): void {
  const cx = spot.cx * w;
  const cy = spot.cy * h;
  const r = spot.r * h;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (const [scale, alpha] of [[1.2, 0.16], [1, 0.3], [0.6, 0.26]] as const) {
    ragged(ctx, cx + (rand() - 0.5) * r * 0.1, cy + (rand() - 0.5) * r * 0.1, r * scale, rand, 13, 0.4);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * scale);
    g.addColorStop(0, `rgba(176,128,84,${alpha + 0.12})`);
    g.addColorStop(1, `rgba(128,82,44,${alpha})`);
    ctx.fillStyle = g;
    ctx.fill();
  }
  // a stain dries darkest at its edge
  ragged(ctx, cx, cy, r * 1.02, rand, 13, 0.38);
  ctx.strokeStyle = "rgba(96,58,30,0.32)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawThread(ctx: CanvasRenderingContext2D, spot: Spot, w: number, h: number, dpr: number): void {
  const half = (spot.halfLength ?? 0.2) * w;
  const x0 = spot.cx * w - half;
  const x1 = spot.cx * w + half;
  const y = spot.cy * h;
  const wave = (x: number): number => Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 3.2) * 3 * dpr;
  const path = (dy: number) => {
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 4 * dpr) {
      const py = y + wave(x) + dy;
      if (x === x0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  path(3.5 * dpr);
  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = 5.5 * dpr;
  ctx.stroke();
  path(0);
  ctx.strokeStyle = "rgb(196,208,234)";
  ctx.lineWidth = 3.2 * dpr;
  ctx.stroke();
  path(-0.8 * dpr);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 0.9 * dpr;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y + wave(x1));
  ctx.bezierCurveTo(x1 + 16 * dpr, y - 9 * dpr, x1 + 30 * dpr, y + 14 * dpr, x1 + 40 * dpr, y + 2 * dpr);
  ctx.strokeStyle = "rgb(196,208,234)";
  ctx.lineWidth = 2.2 * dpr;
  ctx.stroke();
}

/** The cloth with its defects, at device pixels. */
export function renderCloth(width: number, height: number, dpr: number): HTMLCanvasElement {
  const [canvas, ctx] = canvasOf(width, height);
  const rand = rng(11);
  weave(ctx, width, height, CELL * dpr, rand);
  for (const spot of SPOTS) {
    if (spot.kind === "hole") drawHole(ctx, spot, width, height, dpr, rand);
    else if (spot.kind === "stain") drawStain(ctx, spot, width, height, rand);
    else drawThread(ctx, spot, width, height, dpr);
  }
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

/** The same cloth as a scanner sees it: cool monochrome, a measuring grid, and every defect outlined and named. */
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

  for (const spot of SPOTS) {
    const b = spotBox(spot, width, height);
    bracketBox(ctx, b.x, b.y, b.w, b.h, dpr);
    chip(ctx, spot.label.toUpperCase(), b.x, b.y - 2 * dpr, dpr);
  }
  return canvas;
}
