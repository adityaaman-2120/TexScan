import { useMemo } from "react";
import type { RollOut } from "@/api/types";
import { cn } from "@/lib/utils";
import { DEFECT_LABELS } from "@/features/inspect/defectLabels";

const kindLabel = (type: string): string => (DEFECT_LABELS as Record<string, string>)[type] ?? "Unknown";
import { axisTicks, coverageBars, formatMetres, layoutMarkers, POINT_COLORS, pointsColor } from "./rollMath";

const LANE_PX = 20;
const STRIP_WIDTH = 120;

export const defectKey = (d: { capture_id: number; defect_id: number }): string => `${d.capture_id}-${d.defect_id}`;

interface DefectMapProps {
  roll: RollOut;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

/** The roll as a vertical strip, start at the top. Each defect is a marker at its position, coloured by points. */
export function DefectMap({ roll, selectedKey, onSelect }: DefectMapProps) {
  const layout = useMemo(() => new Map(layoutMarkers(roll.defects.map((d) => ({ key: defectKey(d), position_m: d.position_m })), roll.length_m).map((m) => [m.key, m])), [roll]);
  const bars = useMemo(() => coverageBars(roll.captures, roll.length_m), [roll]);
  const ticks = useMemo(() => axisTicks(roll.length_m), [roll.length_m]);

  return (
    <figure className="space-y-3">
      <div className="flex gap-2" style={{ height: "30rem" }}>
        <div className="relative w-14 shrink-0" aria-hidden>
          {ticks.map((m) => (
            <span key={m} className="num absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: `${(m / roll.length_m) * 100}%` }}>
              {m} m
            </span>
          ))}
        </div>

        <div
          role="group"
          aria-label={`Defect map of roll ${roll.code}: ${roll.defects.length} defects along ${formatMetres(roll.length_m)}`}
          className="relative shrink-0 rounded-md border bg-muted/30"
          style={{ width: STRIP_WIDTH }}
        >
          {ticks.map((m) => (
            <span key={m} aria-hidden className="absolute inset-x-0 border-t border-border/50" style={{ top: `${(m / roll.length_m) * 100}%` }} />
          ))}
          {bars.map((b, i) => (
            <span key={i} aria-hidden className="absolute inset-x-0 bg-primary/10" style={{ top: `${b.top}%`, height: `${b.height}%` }} />
          ))}
          {roll.defects.map((d) => {
            const key = defectKey(d);
            const place = layout.get(key);
            if (!place) return null;
            const selected = key === selectedKey;
            const color = pointsColor(d.points);
            const left = 8 + place.lane * LANE_PX;
            const extent = ((d.end_m - d.start_m) / roll.length_m) * 100;
            return (
              <div key={key}>
                {d.continuous && (
                  <span aria-hidden className="absolute w-1 rounded-full opacity-60" style={{ left: left + 6, top: `${(d.start_m / roll.length_m) * 100}%`, height: `${extent}%`, background: color }} />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  aria-pressed={selected}
                  aria-label={`${kindLabel(d.defect_type)} at ${formatMetres(d.position_m)}, ${d.points} ${d.points === 1 ? "point" : "points"}`}
                  title={`${formatMetres(d.position_m)} · ${d.points} pt`}
                  className={cn(
                    "absolute size-4 -translate-y-1/2 rounded-full border-2 border-background outline-none transition-transform hover:scale-125 focus-visible:ring-[3px] focus-visible:ring-ring",
                    selected && "scale-125 ring-2 ring-foreground",
                  )}
                  style={{ left, top: `${place.top}%`, background: color }}
                />
              </div>
            );
          })}
        </div>

        <div className="flex flex-col justify-between py-0.5 text-[11px] text-muted-foreground" aria-hidden>
          <span>Roll start</span>
          <span>Roll end</span>
        </div>
      </div>

      <figcaption>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
          {([1, 2, 3, 4] as const).map((p) => (
            <li key={p} className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-full" style={{ background: POINT_COLORS[p] }} />
              <span className="num">{p}</span> {p === 1 ? "point" : "points"}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-sm bg-primary/20" />
            Covered by a picture
          </li>
        </ul>
        {roll.defects.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No defects scored yet. Markers appear here as pictures are added.</p>}
      </figcaption>
    </figure>
  );
}
