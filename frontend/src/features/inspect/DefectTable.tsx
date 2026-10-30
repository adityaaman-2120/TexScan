import { CircleCheck } from "lucide-react";
import type { Defect } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEFECT_LABELS } from "./defectLabels";

const MAX_ROWS = 200;

interface DefectTableProps {
  defects: Defect[];
  hoveredId: number | null;
  selectedId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
}

export function DefectTable({ defects, hoveredId, selectedId, onHover, onSelect }: DefectTableProps) {
  if (defects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CircleCheck className="size-8 text-success" />
        <p className="text-sm font-medium">No defects found</p>
        <p className="max-w-xs text-xs text-muted-foreground">Nothing above the threshold survived the area filter.</p>
      </div>
    );
  }
  const rows = defects.slice(0, MAX_ROWS);
  return (
    <div className="max-h-[340px] overflow-auto rounded-lg border">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 font-medium">#</th>
            <th scope="col" className="px-3 py-2 font-medium">Type</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Area</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Aspect</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
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
              <td className="px-3 py-2">
                <Badge variant="outline">{DEFECT_LABELS[d.defect_type ?? "unknown"]}</Badge>
              </td>
              <td className="num px-3 py-2 text-right">{d.area.toLocaleString()} px</td>
              <td className="num px-3 py-2 text-right">{d.aspect_ratio.toFixed(1)}</td>
              <td className="px-3 py-2">
                <div className="ml-auto flex w-24 items-center justify-end gap-2">
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(d.type_confidence ?? 0) * 100}%` }} />
                  </div>
                  <span className="num w-9 text-right">{d.type_confidence == null ? "—" : `${Math.round(d.type_confidence * 100)}%`}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {defects.length > rows.length && (
        <p className="border-t bg-card px-3 py-2 text-center text-xs text-muted-foreground">
          Showing the first {MAX_ROWS} of {defects.length.toLocaleString()} regions. This many usually means the method does not fit this texture.
        </p>
      )}
    </div>
  );
}
