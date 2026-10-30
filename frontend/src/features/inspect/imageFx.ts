import { useEffect, useState } from "react";

/* Canvas-based layers built from the stage PNGs the backend already produced:
   a tinted mask, an edge layer and a heatmap, so the overlay opacity can be changed live. */

const RED: [number, number, number] = [239, 68, 68];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function canvasFor(img: HTMLImageElement): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; data: ImageData } {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { canvas, ctx, data: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

/** White pixels of a binary mask become a solid red fill; everything else is transparent. */
export function maskLayer(img: HTMLImageElement): string {
  const { canvas, ctx, data } = canvasFor(img);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i]! > 127;
    d[i] = RED[0];
    d[i + 1] = RED[1];
    d[i + 2] = RED[2];
    d[i + 3] = on ? 255 : 0;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL();
}

/** Keep only the pure-red outline pixels the backend painted on the overlay image, thickened by one pixel. */
export function edgeLayer(img: HTMLImageElement): string {
  const { canvas, ctx, data } = canvasFor(img);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const edge = d[i]! > 200 && d[i + 1]! < 70 && d[i + 2]! < 70;
    d[i + 3] = edge ? 255 : 0;
  }
  ctx.putImageData(data, 0, 0);
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const octx = out.getContext("2d")!;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]] as const) octx.drawImage(canvas, dx, dy);
  return out.toDataURL();
}

/** Transparent -> cyan -> amber -> red; low scores stay see-through so the image shows underneath. */
const RAMP: [number, [number, number, number, number]][] = [
  [0, [0, 0, 0, 0]],
  [0.15, [34, 211, 238, 0]],
  [0.4, [34, 211, 238, 140]],
  [0.7, [250, 190, 40, 200]],
  [1, [239, 68, 68, 255]],
];

export function heatColor(v: number): [number, number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i]!;
    const [t0, c0] = RAMP[i - 1]!;
    if (v <= t1) {
      const f = (v - t0) / (t1 - t0);
      return [0, 1, 2, 3].map((k) => c0[k]! + (c1[k]! - c0[k]!) * f) as [number, number, number, number];
    }
  }
  return RAMP[RAMP.length - 1]![1];
}

/** Grayscale score map -> colour heatmap. */
export function heatLayer(img: HTMLImageElement): string {
  const { canvas, ctx, data } = canvasFor(img);
  const d = data.data;
  const lut = Array.from({ length: 256 }, (_, v) => heatColor(v / 255));
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b, a] = lut[d[i]!]!;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = a;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL();
}

const cache = new Map<string, Promise<string>>();
const MAX_CACHED = 24;

/** Build a layer once per (kind, url); stage URLs are unique per inspection so entries never go stale. */
export function useLayer(url: string | undefined, kind: "mask" | "edges" | "heat"): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) {
      setSrc(null);
      return;
    }
    const key = `${kind}:${url}`;
    let promise = cache.get(key);
    if (!promise) {
      const build = { mask: maskLayer, edges: edgeLayer, heat: heatLayer }[kind];
      promise = loadImage(url).then(build);
      cache.set(key, promise);
      if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
    }
    let alive = true;
    promise.then((s) => alive && setSrc(s)).catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [url, kind]);
  return src;
}
