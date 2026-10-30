import { Maximize2, Minus, Plus, ScanLine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fileUrl } from "@/api/client";
import type { InspectionOut } from "@/api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFECT_LABELS } from "./defectLabels";
import { heatKey } from "./stageInfo";
import { useLayer } from "./imageFx";
import { useViewport } from "./useViewport";
import { bboxToRect } from "./viewportMath";

export type OverlayMode = "none" | "boxes" | "mask" | "edges" | "heatmap";

export interface FocusRequest {
  id: number;
  nonce: number;
}

interface ViewerProps {
  result: InspectionOut;
  mode: OverlayMode;
  opacity: number;
  hoveredId: number | null;
  selectedId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number | null) => void;
  focusRequest: FocusRequest | null;
  busy: boolean;
}

interface Tip {
  id: number;
  x: number;
  y: number;
}

const HIT_PADDING_PX = 5; // hover targets are a few screen pixels larger than the defect itself

export function Viewer({ result, mode, opacity, hoveredId, selectedId, onHover, onSelect, focusRequest, busy }: ViewerProps) {
  const w = result.metrics.image_width;
  const h = result.metrics.image_height;
  const { containerRef, view, smooth, dragging, fit, zoomBy, zoomToRect, actualSize, wasDrag, handlers } = useViewport({ w, h });
  const [tip, setTip] = useState<Tip | null>(null);

  const urls = result.stage_urls;
  const heat = heatKey(urls);
  const maskSrc = useLayer(mode === "mask" && urls.mask_clean ? fileUrl(urls.mask_clean) : undefined, "mask");
  const edgesSrc = useLayer(mode === "edges" && urls.overlay ? fileUrl(urls.overlay) : undefined, "edges");
  const heatSrc = useLayer(mode === "heatmap" && heat ? fileUrl(urls[heat]!) : undefined, "heat");
  const layerSrc = mode === "mask" ? maskSrc : mode === "edges" ? edgesSrc : mode === "heatmap" ? heatSrc : null;

  const byId = useMemo(() => new Map(result.defects.map((d) => [d.id, d])), [result.defects]);

  useEffect(() => {
    if (!focusRequest) return;
    const d = byId.get(focusRequest.id);
    if (d) zoomToRect(bboxToRect(d.bbox));
  }, [focusRequest, byId, zoomToRect]);

  const hoverTip = (id: number, e: React.PointerEvent) => {
    const box = containerRef.current!.getBoundingClientRect();
    setTip({ id, x: e.clientX - box.left, y: e.clientY - box.top });
    onHover(id);
  };
  const leave = () => {
    setTip(null);
    onHover(null);
  };

  const tipDefect = tip ? byId.get(tip.id) : hoveredId !== null ? byId.get(hoveredId) : undefined;
  const containerW = containerRef.current?.clientWidth ?? 0;
  const stroke = (id: number): { stroke: string; width: number } =>
    id === selectedId ? { stroke: "var(--primary)", width: 3 } : id === hoveredId ? { stroke: "var(--primary)", width: 2.5 } : { stroke: "var(--destructive)", width: 2 };
  const pad = HIT_PADDING_PX / view.scale;

  return (
    <div
      ref={containerRef}
      {...handlers}
      onDoubleClick={() => fit()}
      className={cn(
        "relative h-[min(62vh,620px)] min-h-[320px] w-full touch-none select-none overflow-hidden rounded-lg border bg-black/40",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      role="img"
      aria-label={`Inspection result: ${result.decision}, ${result.defects.length} defects. Scroll to zoom, drag to pan, double-click to fit.`}
    >
      {/* the image and every layer share one coordinate system: image pixels */}
      <div
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{
          width: w,
          height: h,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transition: smooth ? "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
        }}
      >
        <img
          src={fileUrl(urls.original!)}
          alt=""
          draggable={false}
          width={w}
          height={h}
          className="absolute inset-0 max-w-none"
          style={{ imageRendering: view.scale > 4 ? "pixelated" : "auto" }}
        />
        {layerSrc && (
          <img
            src={layerSrc}
            alt=""
            draggable={false}
            width={w}
            height={h}
            className="pointer-events-none absolute inset-0 max-w-none"
            style={{ opacity, imageRendering: view.scale > 4 ? "pixelated" : "auto" }}
          />
        )}
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="absolute inset-0 max-w-none overflow-visible" style={{ pointerEvents: "none" }}>
          {result.defects.map((d) => {
            const [x, y, bw, bh] = d.bbox;
            const s = stroke(d.id);
            return (
              <g key={d.id}>
                {mode === "boxes" && (
                  <rect x={x} y={y} width={bw} height={bh} fill="none" stroke={s.stroke} strokeWidth={s.width} strokeOpacity={opacity} vectorEffect="non-scaling-stroke" rx={1} />
                )}
                {mode !== "boxes" && (d.id === hoveredId || d.id === selectedId) && (
                  <rect x={x} y={y} width={bw} height={bh} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                )}
                <rect
                  x={x - pad}
                  y={y - pad}
                  width={bw + 2 * pad}
                  height={bh + 2 * pad}
                  fill="transparent"
                  style={{ pointerEvents: "all", cursor: "pointer" }}
                  data-defect={d.id}
                  onPointerEnter={(e) => hoverTip(d.id, e)}
                  onPointerMove={(e) => hoverTip(d.id, e)}
                  onPointerLeave={leave}
                  onClick={() => {
                    if (!wasDrag()) onSelect(d.id === selectedId ? null : d.id);
                  }}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {tip && tipDefect && (
        <div
          className="pointer-events-none absolute z-10 w-52 rounded-lg border bg-popover/95 p-3 text-xs shadow-xl backdrop-blur"
          style={{ left: Math.min(tip.x + 14, Math.max(8, containerW - 216)), top: Math.max(8, tip.y - 8) }}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-semibold">
              <span className="num mr-1.5 text-muted-foreground">#{tipDefect.id}</span>
              {DEFECT_LABELS[tipDefect.defect_type ?? "unknown"]}
            </span>
          </div>
          <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-muted-foreground">
            <dt>area</dt>
            <dd className="text-foreground">{tipDefect.area} px</dd>
            <dt>confidence</dt>
            <dd className="text-foreground">{tipDefect.type_confidence == null ? "—" : `${Math.round(tipDefect.type_confidence * 100)}%`}</dd>
            <dt>aspect</dt>
            <dd className="text-foreground">{tipDefect.aspect_ratio.toFixed(1)}</dd>
          </dl>
        </div>
      )}

      {busy && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary" />}

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border bg-background/80 p-1 backdrop-blur" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.5)}>
          <Minus />
        </Button>
        <span className="num w-12 text-center text-xs text-muted-foreground">{Math.round(view.scale * 100)}%</span>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoomBy(1.5)}>
          <Plus />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Fit to view" onClick={() => fit()}>
          <Maximize2 />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Actual size (100%)" onClick={actualSize}>
          <ScanLine />
        </Button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 hidden rounded-md bg-background/70 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur sm:block">
        scroll to zoom · drag to pan · double-click to fit
      </div>
    </div>
  );
}
