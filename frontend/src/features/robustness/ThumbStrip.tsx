import { CircleCheck, CircleX } from "lucide-react";
import type { RobustnessPoint } from "@/api/types";
import { cn } from "@/lib/utils";
import { formatLevel, type Degradation } from "./levels";

interface ThumbStripProps {
  kind: Degradation;
  original: string;
  points: RobustnessPoint[];
}

/** The degraded images themselves, in level order, each with the verdict it got. */
export function ThumbStrip({ kind, original, points }: ThumbStripProps) {
  const sorted = [...points].sort((a, b) => a.level - b.level);
  return (
    <ul className="flex gap-3 overflow-x-auto pb-2" aria-label="Degraded images">
      <li className="w-28 shrink-0">
        <div className="overflow-hidden rounded-lg border bg-black/40">
          <img src={original} alt="Original image" className="aspect-square w-full object-cover" />
        </div>
        <div className="mt-1.5 text-xs font-medium">Original</div>
        <div className="num text-[11px] text-muted-foreground">no degradation</div>
      </li>
      {sorted.map((p) => {
        const pass = p.decision === "PASS";
        return (
          <li key={p.level} className="w-28 shrink-0">
            <div className={cn("relative overflow-hidden rounded-lg border-2 bg-black/40", pass ? "border-success/50" : "border-destructive/50")}>
              {p.thumbnail && <img src={p.thumbnail} alt={`Degraded image, level ${formatLevel(kind, p.level)}`} loading="lazy" className="aspect-square w-full object-cover" />}
              <span className={cn("num absolute left-1 top-1 inline-flex items-center gap-1 rounded border bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold", pass ? "border-success/50 text-success" : "border-destructive/50 text-destructive")}>
                {pass ? <CircleCheck className="size-3" /> : <CircleX className="size-3" />}
                {p.decision}
              </span>
            </div>
            <div className="num mt-1.5 text-xs font-medium">{formatLevel(kind, p.level)}</div>
            <div className="num text-[11px] text-muted-foreground">{p.defect_area_percent.toFixed(2)}% area</div>
          </li>
        );
      })}
    </ul>
  );
}
