import { useEffect, useState } from "react";

export interface DiffCounts {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

/** green = found, red = false alarm, amber = missed, transparent = agreement on "no defect" */
export const DIFF_COLORS = { tp: [34, 197, 94], fp: [239, 68, 68], fn: [250, 190, 40] } as const;

/**
 * Compare a predicted mask with the ground truth pixel by pixel. Inputs are single-channel arrays (0-255);
 * a pixel counts as defect above `threshold`. Returns the confusion counts and an RGBA image of the disagreement.
 */
export function classifyPixels(pred: ArrayLike<number>, gt: ArrayLike<number>, threshold = 127): { counts: DiffCounts; rgba: Uint8ClampedArray<ArrayBuffer> } {
  if (pred.length !== gt.length) throw new Error("masks must have the same size");
  const rgba = new Uint8ClampedArray(new ArrayBuffer(pred.length * 4));
  const counts: DiffCounts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (let i = 0; i < pred.length; i++) {
    const p = pred[i]! > threshold;
    const g = gt[i]! > threshold;
    const kind = p && g ? "tp" : p ? "fp" : g ? "fn" : "tn";
    counts[kind] += 1;
    if (kind !== "tn") {
      const [r, gr, b] = DIFF_COLORS[kind];
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = gr;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = 235;
    }
  }
  return { counts, rgba };
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not load a mask image"));
    img.src = src;
  });
}

function channel(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false; // masks are binary: resize with nearest neighbour like the server does
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4]!;
  return out;
}

export interface DiffMap {
  src: string;
  counts: DiffCounts;
}

/** Error map of a method's mask against the ground truth, built in the browser from the two images. */
export function useDiffMap(predUri: string | null | undefined, gtUrl: string | null | undefined): DiffMap | null {
  const [map, setMap] = useState<DiffMap | null>(null);
  useEffect(() => {
    if (!predUri || !gtUrl) {
      setMap(null);
      return;
    }
    let alive = true;
    Promise.all([load(predUri), load(gtUrl)])
      .then(([pred, gt]) => {
        const w = pred.naturalWidth;
        const h = pred.naturalHeight;
        const { counts, rgba } = classifyPixels(channel(pred, w, h), channel(gt, w, h));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.putImageData(new ImageData(rgba, w, h), 0, 0);
        if (alive) setMap({ src: canvas.toDataURL(), counts });
      })
      .catch(() => alive && setMap(null));
    return () => {
      alive = false;
    };
  }, [predUri, gtUrl]);
  return map;
}
