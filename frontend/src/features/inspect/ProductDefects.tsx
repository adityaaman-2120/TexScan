import { CircleCheck } from "lucide-react";
import type { Defect } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeSize } from "@/features/calibration/defectSize";
import { SizeNote } from "@/features/calibration/SizeNote";
import { toOperatorDefects, type SizeClass } from "./operator";

const MAX_ROWS = 50;

const SIZE_STYLE: Record<SizeClass, string> = {
  Small: "border-border text-muted-foreground",
  Medium: "border-warning/40 text-warning",
  Large: "border-destructive/50 text-destructive",
};

interface ProductDefectsProps {
  defects: Defect[];
  width: number;
  height: number;
  hoveredId: number | null;
  selectedId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
  /** Whether the profile used has a size calibration (sizes in mm and inches) or not (pixels). */
  calibrated: boolean;
  profileId: number | null;
}

/** The defects of one piece in shop-floor words: what it is, how big, and where. */
export function ProductDefects({ defects, width, height, hoveredId, selectedId, onHover, onSelect, calibrated, profileId }: ProductDefectsProps) {
  if (defects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CircleCheck className="size-8 text-success" />
        <p className="text-sm font-medium">No defects found</p>
        <p className="max-w-xs text-xs text-muted-foreground">This piece looks clean at the current sensitivity.</p>
      </div>
    );
  }
  const shown = defects.slice(0, MAX_ROWS);
  const rows = toOperatorDefects(shown, width, height);
  return (
    <>
    <SizeNote calibrated={calibrated} profileId={profileId} />
    <div className="max-h-[340px] overflow-auto rounded-lg border">
      <table className="w-full text-[13px]">
        <caption className="sr-only">Defects found, with type, size and location</caption>
        <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 font-medium">#</th>
            <th scope="col" className="px-3 py-2 font-medium">Defect</th>
            <th scope="col" className="px-3 py-2 font-medium">Size</th>
            <th scope="col" className="px-3 py-2 font-medium">Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const size = describeSize(shown[i]!);
            return (
            <tr
              key={d.id}
              tabIndex={0}
              aria-selected={d.id === selectedId}
              onClick={() => onSelect(d.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(d.id);
                }
              }}
              onPointerEnter={() => onHover(d.id)}
              onPointerLeave={() => onHover(null)}
              className={cn(
                "cursor-pointer border-b border-border/50 outline-none transition-colors last:border-0 hover:bg-accent/60 focus-visible:bg-accent",
                (d.id === hoveredId || d.id === selectedId) && "bg-primary/10",
              )}
            >
              <td className="num px-3 py-2 text-muted-foreground">{d.id}</td>
              <td className="px-3 py-2 font-medium">{d.type}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge variant="outline" className={SIZE_STYLE[d.size]}>
                    {d.size}
                  </Badge>
                  <span className="num text-xs text-muted-foreground">{d.share} of the piece</span>
                </div>
                <div className="num mt-1 text-xs">{size.main}</div>
                {size.alt && <div className="num text-[11px] text-muted-foreground">{size.alt}</div>}
              </td>
              <td className="px-3 py-2">{d.location}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {defects.length > rows.length && (
        <p className="border-t bg-card px-3 py-2 text-center text-xs text-muted-foreground">
          Showing the first {MAX_ROWS} of {defects.length.toLocaleString()} defects. This many usually means the profile does not match this fabric.
        </p>
      )}
    </div>
    </>
  );
}
