import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canvasPoint, cutoffPx, mirrorCanvas, radialGain, SHARPEN_BOOST, type PeakPair, type Point, type Preset } from "./filters";
import { newCanvas } from "./mask";
import type { Tool } from "./useSpectrumStudio";

const CYAN = "#22d3ee";
const REJECT = "rgb(239, 68, 68)";
const PAINT_NOTIFY_MS = 120; // how often a long stroke tells the page that the mask changed

/** Blue where a preset attenuates, amber where sharpen boosts: shows which frequencies the filter keeps. */
function buildGainTint(w: number, h: number, preset: Preset): HTMLCanvasElement | null {
  if (preset.kind === "none") return null;
  const canvas = newCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(w, h);
  const cutoff = cutoffPx(preset.cutoffFrac, Math.min(w, h));
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = radialGain(preset, cutoff, Math.hypot(x - cx, y - cy));
      const i = (y * w + x) * 4;
      if (g < 0.999) {
        data.data[i] = 59;
        data.data[i + 1] = 130;
        data.data[i + 2] = 246;
        data.data[i + 3] = (1 - g) * 150;
      } else if (g > 1.001) {
        data.data[i] = 250;
        data.data[i + 1] = 190;
        data.data[i + 2] = 40;
        data.data[i + 3] = Math.min(1, (g - 1) / SHARPEN_BOOST) * 95;
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

interface SpectrumCanvasProps {
  spectrumUrl: string;
  width: number;
  height: number;
  pairs: PeakPair[];
  enabled: ReadonlySet<string>;
  peakRadius: number;
  paint: HTMLCanvasElement;
  tool: Tool;
  brushRadius: number;
  symmetric: boolean;
  preset: Preset;
  onPaint: () => void;
  onTogglePair: (id: string) => void;
}

/**
 * The log-magnitude spectrum on an HTML canvas, with everything that edits it drawn on top:
 * filter response tint, rejected regions (peaks + brush), peak circles and the brush cursor.
 * Brush strokes go to the `paint` canvas (white = reject) and are mirrored through the centre in symmetric mode.
 */
export function SpectrumCanvas(props: SpectrumCanvasProps) {
  const { spectrumUrl, width: w, height: h, pairs, enabled, peakRadius, paint, tool, brushRadius, symmetric, preset, onPaint, onTogglePair } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const cursor = useRef<Point | null>(null);
  const stroke = useRef<{ last: Point; notified: number } | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = spectrumUrl;
  }, [spectrumUrl]);

  const gainTint = useMemo(() => buildGainTint(w, h, preset), [w, h, preset]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);
    if (gainTint) ctx.drawImage(gainTint, 0, 0);

    // rejected frequencies: enabled peak discs + brush strokes, tinted red
    const tmp = (scratch.current ??= newCanvas(w, h));
    const t = tmp.getContext("2d")!;
    t.globalCompositeOperation = "source-over";
    t.clearRect(0, 0, w, h);
    t.fillStyle = "#fff";
    for (const pair of pairs) {
      if (!enabled.has(pair.id)) continue;
      for (const p of [pair.a, pair.b]) {
        t.beginPath();
        t.arc(p.x + 0.5, p.y + 0.5, peakRadius, 0, Math.PI * 2);
        t.fill();
      }
    }
    t.drawImage(paint, 0, 0);
    t.globalCompositeOperation = "source-in";
    t.fillStyle = REJECT;
    t.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(tmp, 0, 0);
    ctx.globalAlpha = 1;

    // peak circles: solid cyan when rejected, dashed grey when switched off
    const lw = Math.max(1.5, w / 400);
    ctx.lineWidth = lw;
    for (const pair of pairs) {
      const on = enabled.has(pair.id);
      ctx.strokeStyle = on ? CYAN : "rgba(180, 190, 205, 0.85)";
      ctx.setLineDash(on ? [] : [4, 3]);
      for (const p of [pair.a, pair.b]) {
        ctx.beginPath();
        ctx.arc(p.x + 0.5, p.y + 0.5, peakRadius + 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // DC marker
    const cx = Math.floor(w / 2) + 0.5;
    const cy = Math.floor(h / 2) + 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();

    // brush cursor (and its mirror)
    if (cursor.current && tool !== "select") {
      ctx.strokeStyle = tool === "erase" ? "#ffffff" : REJECT;
      ctx.setLineDash(tool === "erase" ? [4, 3] : []);
      const rings = symmetric ? [cursor.current, mirrorCanvas(cursor.current, w, h)] : [cursor.current];
      rings.forEach((p, i) => {
        ctx.globalAlpha = i === 0 ? 1 : 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, brushRadius, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
  }, [image, w, h, gainTint, pairs, enabled, peakRadius, paint, tool, brushRadius, symmetric]);

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const requestDraw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => drawRef.current());
  }, []);
  useEffect(() => {
    requestDraw();
    return () => cancelAnimationFrame(frame.current);
  }, [draw, requestDraw]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => canvasPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), w, h);

  const paintSegment = (a: Point, b: Point) => {
    const ctx = paint.getContext("2d")!;
    const draw1 = (p: Point, q: Point) => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushRadius * 2;
      ctx.strokeStyle = "#fff";
      ctx.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    };
    draw1(a, b);
    if (symmetric) draw1(mirrorCanvas(a, w, h), mirrorCanvas(b, w, h));
    ctx.globalCompositeOperation = "source-over";
  };

  const hitPair = (p: Point): PeakPair | undefined => {
    const reach = Math.max(peakRadius + 4, 8);
    return pairs.find((pair) => [pair.a, pair.b].some((q) => Math.hypot(q.x + 0.5 - p.x, q.y + 0.5 - p.y) <= reach));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = point(e);
    if (tool === "select") {
      const hit = hitPair(p);
      if (hit) onTogglePair(hit.id);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    stroke.current = { last: p, notified: performance.now() };
    paintSegment(p, p);
    requestDraw();
    onPaint();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = point(e);
    cursor.current = p;
    if (stroke.current) {
      paintSegment(stroke.current.last, p);
      stroke.current.last = p;
      const now = performance.now();
      if (now - stroke.current.notified > PAINT_NOTIFY_MS) {
        stroke.current.notified = now;
        onPaint();
      }
    }
    requestDraw();
  };

  const endStroke = () => {
    if (stroke.current) {
      stroke.current = null;
      onPaint();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      role="img"
      aria-label="Frequency spectrum editor. Bright dots are repeating patterns; circles mark detected peaks. Painting rejects frequencies. Use the peak list to switch peaks with the keyboard."
      className={`block w-full touch-none select-none rounded-lg border bg-black ${tool === "select" ? "cursor-pointer" : "cursor-none"}`}
      style={{ aspectRatio: `${w} / ${h}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={() => {
        cursor.current = null;
        endStroke();
        requestDraw();
      }}
    />
  );
}
