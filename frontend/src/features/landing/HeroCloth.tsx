import { useEffect, useRef } from "react";
import { renderCloth, renderScanned } from "./clothRender";
import { clamp01, invertPingPong, pingPong, stepToward } from "./scanMath";

const SWEEP_SECONDS = 11;
const IDLE_AFTER_MS = 2200; // the beam goes back to sweeping by itself this long after the pointer stops

/**
 * Woven cloth with defects, drawn on a canvas. A scan beam passes over it: behind the beam the cloth is shown as the
 * scanner sees it, defects outlined and named. The beam follows the pointer, and sweeps by itself otherwise.
 * Decorative: it shows no data, so it is hidden from assistive technology.
 */
export function HeroCloth({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raw: HTMLCanvasElement | null = null;
    let scanned: HTMLCanvasElement | null = null;
    let beam = reduced ? 0.62 : 0.12;
    let target: number | null = null;
    let lastPointer = -Infinity;
    let visible = true;
    let raf = 0;
    let previous = performance.now();

    let drawnX = -1; // where the beam was last painted, in device pixels; -1 = nothing painted yet

    /** Paint the columns [from, to): the plain cloth, and the scanned cloth up to the beam. */
    const paint = (from: number, to: number, beamX: number) => {
      if (!raw || !scanned) return;
      const h = el.height;
      const a = Math.max(0, Math.floor(from));
      const b = Math.min(el.width, Math.ceil(to));
      if (b <= a) return;
      ctx.drawImage(raw, a, 0, b - a, h, a, 0, b - a, h);
      const scannedTo = Math.min(b, beamX);
      if (scannedTo > a) ctx.drawImage(scanned, a, 0, scannedTo - a, h, a, 0, scannedTo - a, h);
    };

    const draw = () => {
      if (!raw || !scanned) return;
      const { width: w, height: h } = el;
      const dpr = w / Math.max(1, el.clientWidth);
      const x = Math.round(beam * w);
      if (x === drawnX) return;
      if (drawnX < 0) paint(0, w, x);
      else paint(Math.min(drawnX, x) - 124 * dpr, Math.max(drawnX, x) + 10 * dpr, x); // only the strip the beam passed over, glow included
      drawnX = x;
      const glow = ctx.createLinearGradient(x - 120 * dpr, 0, x, 0);
      glow.addColorStop(0, "rgba(94,226,248,0)");
      glow.addColorStop(1, "rgba(94,226,248,0.26)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 120 * dpr, 0, 120 * dpr, h);
      ctx.fillStyle = "#8ff0ff";
      ctx.fillRect(x - dpr, 0, 2 * dpr, h);
      ctx.fillStyle = "#8ff0ff";
      for (const y of [0, h]) {
        ctx.beginPath();
        ctx.moveTo(x - 7 * dpr, y);
        ctx.lineTo(x + 7 * dpr, y);
        ctx.lineTo(x, y + (y === 0 ? 11 : -11) * dpr);
        ctx.closePath();
        ctx.fill();
      }
    };

    const build = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(el.clientWidth * dpr));
      const h = Math.max(2, Math.round(el.clientHeight * dpr));
      if (w === el.width && h === el.height && raw) return;
      el.width = w;
      el.height = h;
      drawnX = -1;
      raw = renderCloth(w, h, dpr);
      scanned = renderScanned(raw, dpr);
      draw();
    };

    // the loop: pointer steers the beam, otherwise it sweeps; the sweep resumes from the beam's position
    let autoSeconds = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      if (!visible || document.hidden) return;
      if (target !== null && now - lastPointer < IDLE_AFTER_MS) {
        beam = stepToward(beam, target, dt);
        autoSeconds = invertPingPong(beam, SWEEP_SECONDS);
      } else {
        target = null;
        autoSeconds += dt;
        beam = stepToward(beam, pingPong(autoSeconds, SWEEP_SECONDS), dt, 14);
      }
      draw();
    };
    const onPointer = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const inside = e.clientY >= rect.top - 12 && e.clientY <= rect.bottom + 12 && e.clientX >= rect.left - 12 && e.clientX <= rect.right + 12;
      if (!inside) return;
      target = clamp01((e.clientX - rect.left) / rect.width);
      lastPointer = performance.now();
      if (reduced) {
        beam = target;
        draw();
      }
    };

    build();
    const resize = new ResizeObserver(() => build());
    resize.observe(el);
    const seen = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
    });
    seen.observe(el);
    window.addEventListener("pointermove", onPointer, { passive: true });
    if (!reduced) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden className={className} />;
}
