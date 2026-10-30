import { useCallback, useEffect, useRef, useState } from "react";
import { fitView, viewForRect, zoomAround, type Rect, type View } from "./viewportMath";

const SMOOTH_MS = 380;
const DRAG_THRESHOLD = 4;

/**
 * Wheel / pinch zoom and drag pan for a fixed-size image inside a container.
 * The view is {scale, x, y}; programmatic moves (fit, zoom buttons, zoom-to-defect) are animated with a CSS transition,
 * direct manipulation is not.
 */
export function useViewport(content: { w: number; h: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [smooth, setSmooth] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fitted = useRef(true);
  const timer = useRef<number | undefined>(undefined);

  const size = () => {
    const el = containerRef.current;
    return { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 };
  };

  const animate = useCallback(() => {
    setSmooth(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSmooth(false), SMOOTH_MS + 40);
  }, []);

  const fit = useCallback(
    (animated = true) => {
      const { w, h } = size();
      if (!w || !h) return;
      if (animated) animate();
      fitted.current = true;
      setView(fitView(w, h, content.w, content.h));
    },
    [animate, content.w, content.h],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const { w, h } = size();
      animate();
      fitted.current = false;
      setView((v) => zoomAround(v, factor, w / 2, h / 2));
    },
    [animate],
  );

  const zoomToRect = useCallback(
    (rect: Rect) => {
      const { w, h } = size();
      if (!w || !h) return;
      animate();
      fitted.current = false;
      setView(viewForRect(w, h, rect));
    },
    [animate],
  );

  const actualSize = useCallback(() => {
    const { w, h } = size();
    animate();
    fitted.current = false;
    setView({ scale: 1, x: (w - content.w) / 2, y: (h - content.h) / 2 });
  }, [animate, content.w, content.h]);

  // fit on mount / when the image changes, and keep fitted views fitted on resize
  useEffect(() => {
    fit(false);
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (fitted.current) fit(false);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  // wheel zoom needs a non-passive listener to stop the page from scrolling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      fitted.current = false;
      setSmooth(false);
      setView((v) => zoomAround(v, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - rect.left, e.clientY - rect.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // pointer handling: one pointer pans, two pinch. Capture starts only after a small movement so clicks still reach children.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const next = { x: e.clientX, y: e.clientY };

    if (!moved.current) {
      if (Math.hypot(next.x - start.current!.x, next.y - start.current!.y) < DRAG_THRESHOLD) return;
      moved.current = true;
      el.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    fitted.current = false;
    setSmooth(false);

    if (pointers.current.size >= 2) {
      const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
      const other = others[0]![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0) setView((v) => zoomAround(v, after / before, (next.x + other.x) / 2 - rect.left, (next.y + other.y) / 2 - rect.top));
    } else {
      setView((v) => ({ ...v, x: v.x + next.x - prev.x, y: v.y + next.y - prev.y }));
    }
    pointers.current.set(e.pointerId, next);
  }, []);

  const endPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      setDragging(false);
      start.current = null;
    }
  }, []);

  /** True if the last pointer gesture was a drag (lets children ignore the click that follows it). */
  const wasDrag = useCallback(() => moved.current, []);

  return {
    containerRef,
    view,
    smooth,
    dragging,
    fit,
    zoomBy,
    zoomToRect,
    actualSize,
    wasDrag,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer },
  };
}
