import type { SpectrumApplyOut } from "@/api/types";
import { DecisionBadge } from "@/components/DecisionBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFECT_LABELS, type DefectKind } from "@/features/inspect/defectLabels";
import { plural } from "@/lib/utils";

function Tile({ title, caption, src, aspect }: { title: string; caption: string; src: string | null; aspect: string }) {
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-lg border bg-black/40" style={{ aspectRatio: aspect }}>
        {src ? <img src={src} alt={title} className="size-full object-contain" /> : <Skeleton className="size-full rounded-none" />}
      </div>
      <figcaption className="mt-2">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11.5px] leading-snug text-muted-foreground">{caption}</div>
      </figcaption>
    </figure>
  );
}

export function ResultPanels({ result, applying, aspect }: { result: SpectrumApplyOut | null; applying: boolean; aspect: string }) {
  const counts = new Map<DefectKind, number>();
  result?.defects.forEach((d) => counts.set(d.defect_type ?? "unknown", (counts.get(d.defect_type ?? "unknown") ?? 0) + 1));

  return (
    <Card className="relative gap-4 overflow-hidden">
      {applying && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary" aria-hidden />}
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Result</CardTitle>
          <CardDescription>Updates a moment after every change you make.</CardDescription>
        </div>
        {result ? (
          <div className="flex flex-wrap items-center gap-2">
            <DecisionBadge decision={result.decision} />
            <span className="num text-xs text-muted-foreground">
              {plural(result.defects.length, "defect")} · {result.defect_area_percent.toFixed(result.defect_area_percent < 1 ? 3 : 2)}%
            </span>
            {[...counts].map(([kind, n]) => (
              <Badge key={kind} variant="outline">
                {n} {DEFECT_LABELS[kind]}
              </Badge>
            ))}
          </div>
        ) : (
          <Skeleton className="h-6 w-48" />
        )}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <Tile title="Residual" caption="The image after the frequency filter (stretched to full brightness)." src={result?.residual ?? null} aspect={aspect} />
        <Tile title="Defect mask" caption="Regions that survive thresholding and cleanup." src={result?.mask ?? null} aspect={aspect} />
        <Tile title="Overlay" caption="Defect outlines on your image." src={result?.overlay ?? null} aspect={aspect} />
      </CardContent>
    </Card>
  );
}
