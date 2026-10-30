import { MoveHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { fileUrl } from "@/api/client";
import { cn } from "@/lib/utils";
import { clamp } from "./viewportMath";

interface CompareSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  width: number;
  height: number;
}

/** Drag the handle (or use the arrow keys) to wipe between two aligned images of the same size. */
export function CompareSlider({ beforeUrl, afterUrl, beforeLabel, afterLabel, width, height }: CompareSliderProps) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = useCallback((clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    setPos(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
  }, []);

  return (
    <div
      ref={box}
      className="relative w-full touch-none select-none overflow-hidden rounded-lg border bg-black/40"
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && update(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <img src={fileUrl(afterUrl)} alt={afterLabel} draggable={false} className="absolute inset-0 size-full object-contain" />
      <img
        src={fileUrl(beforeUrl)}
        alt={beforeLabel}
        draggable={false}
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <span className="absolute left-2 top-2 rounded-md bg-background/80 px-2 py-0.5 text-[11px] font-medium backdrop-blur">{beforeLabel}</span>
      <span className="absolute right-2 top-2 rounded-md bg-background/80 px-2 py-0.5 text-[11px] font-medium backdrop-blur">{afterLabel}</span>

      <div className="absolute inset-y-0 w-0.5 bg-primary shadow-[0_0_12px_var(--primary)]" style={{ left: `${pos}%` }}>
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Compare ${beforeLabel} and ${afterLabel}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPos((p) => clamp(p - 5, 0, 100));
            if (e.key === "ArrowRight") setPos((p) => clamp(p + 5, 0, 100));
          }}
          className={cn(
            "absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-ring",
          )}
        >
          <MoveHorizontal className="size-4" />
        </div>
      </div>
    </div>
  );
}
