import { TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useBenchmark } from "@/api/hooks";
import { METHOD_LABELS, type Method } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { bestPerColumn, buildGrid, formatValue, intensity, METRICS, type Cell, type MetricKey } from "./heatmap";

const MEAN = "mean";

/** One hue, light to dark: dark means better. Text switches to white on the dark cells. */
const cellStyle = (t: number, empty: boolean): React.CSSProperties =>
  empty
    ? { background: "var(--muted)", color: "var(--muted-foreground)" }
    : { background: `color-mix(in oklab, var(--series-1) ${Math.round(8 + 82 * t)}%, var(--card))`, color: t > 0.72 ? "#fff" : "var(--foreground)" };

export function BenchmarkHeatmap() {
  const mvtec = useBenchmark("mvtec");
  const synthetic = useBenchmark("synthetic");
  const [chosen, setChosen] = useState<"mvtec" | "synthetic" | null>(null);
  const [metricKey, setMetricKey] = useState<MetricKey>("f1");
  const [selected, setSelected] = useState<{ method: string; category: string } | null>(null);

  const source = chosen ?? (mvtec.data?.available ? "mvtec" : "synthetic");
  const query = source === "mvtec" ? mvtec : synthetic;
  const data = query.data;
  const metric = METRICS.find((m) => m.key === metricKey)!;
  const grid = useMemo(() => (data?.available ? buildGrid(data.results, metricKey) : null), [data, metricKey]);
  const best = useMemo(() => (grid ? bestPerColumn(grid, metric) : new Set<string>()), [grid, metric]);

  useEffect(() => setSelected(null), [source]);

  if (mvtec.isPending || synthetic.isPending) return <Card className="p-5"><Skeleton className="h-64 w-full" /></Card>;
  const anything = mvtec.data?.available || synthetic.data?.available;

  if (!anything) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            illustration="compare"
            title="No benchmark results yet"
            description="Download MVTec AD, set MVTEC_PATH, then run `make eval` to benchmark every method on every texture category. For a quick look at the harness, `make eval-demo` runs it on a small generated dataset."
          />
        </CardContent>
      </Card>
    );
  }

  const columns = grid ? [...grid.categories, MEAN] : [];
  const cellFor = (method: string, category: string): Cell | undefined => grid?.cells[grid.methods.indexOf(method)]?.[grid.categories.indexOf(category)];
  const sel = selected && selected.category !== MEAN ? cellFor(selected.method, selected.category) : undefined;

  return (
    <div className="space-y-4">
      {data?.meta?.synthetic && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] text-warning" role="note">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>These numbers come from a small generated dataset used to check that the evaluation works. They say nothing about performance on real MVTec AD images.</span>
        </div>
      )}

      <Card className="gap-4">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Benchmark: method × category</CardTitle>
            <CardDescription>
              {data?.meta?.dataset ? `Dataset ${data.meta.dataset.split(/[\\/]/).pop()}` : "Evaluation results"}
              {data?.meta?.max_side ? ` · ${data.meta.max_side}px` : ""}
              {data?.meta?.limit ? ` · first ${data.meta.limit} images per category` : ""}
              {data?.generated_at ? ` · run ${new Date(data.generated_at).toLocaleString()}` : ""}. Stronger blue is better; default settings, untuned.
            </CardDescription>
          </div>
          {mvtec.data?.available && synthetic.data?.available && (
            <Segmented label="Results source" value={source} onChange={(v) => setChosen(v)} options={[{ value: "mvtec", label: "MVTec AD" }, { value: "synthetic", label: "Synthetic" }]} />
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Segmented label="Metric" value={metricKey} onChange={(v) => setMetricKey(v)} options={METRICS.map((m) => ({ value: m.key, label: m.label }))} />
          <p className="text-xs text-muted-foreground">{metric.help}</p>

          {grid && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-separate border-spacing-1 text-sm" aria-label={`${metric.label} by method and category`}>
                <thead>
                  <tr>
                    <th scope="col" className="w-40 px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground"><span className="sr-only">Method</span></th>
                    {columns.map((c) => <th key={c} scope="col" className="px-2 py-1 text-center text-[11px] font-medium capitalize tracking-wider text-muted-foreground">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grid.methods.map((method, r) => (
                    <tr key={method}>
                      <th scope="row" className="px-2 py-1 text-left text-[13px] font-medium">{METHOD_LABELS[method as Method] ?? method}</th>
                      {columns.map((category) => {
                        const isMean = category === MEAN;
                        const value = isMean ? grid.means[r]! : (cellFor(method, category)?.value ?? null);
                        const empty = value === null;
                        const winner = !isMean && best.has(`${method}|${category}`);
                        const active = selected?.method === method && selected.category === category;
                        return (
                          <td key={category} className="p-0">
                            <button
                              type="button"
                              disabled={isMean}
                              onClick={() => setSelected({ method, category })}
                              onFocus={() => !isMean && setSelected({ method, category })}
                              aria-label={`${METHOD_LABELS[method as Method] ?? method}, ${category}: ${formatValue(value, metric)}${winner ? ", best in this column" : ""}`}
                              style={cellStyle(intensity(value, metric, grid.max), empty)}
                              className={cn(
                                "num flex h-11 w-full items-center justify-center rounded-md text-[13px] font-medium outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring",
                                winner && "ring-2 ring-foreground/70",
                                active && "ring-2 ring-primary",
                                isMean && "cursor-default border border-dashed border-border/80",
                              )}
                            >
                              {formatValue(value, metric)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px] text-muted-foreground">
            <span className="flex items-center gap-2">
              worse
              <span className="h-2.5 w-28 rounded-full" style={{ background: "linear-gradient(to right, color-mix(in oklab, var(--series-1) 8%, var(--card)), var(--series-1))" }} aria-hidden />
              better
            </span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm ring-2 ring-foreground/70" aria-hidden />best in its category</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-muted" aria-hidden />n/a: not measurable (e.g. no defective image)</span>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 px-5 py-4" aria-live="polite">
        {sel?.metrics ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{METHOD_LABELS[sel.method as Method] ?? sel.method}</span>
              <Badge variant="outline" className="capitalize">{sel.category}</Badge>
              <span className="num text-xs text-muted-foreground">{sel.metrics.n_images} images · {sel.metrics.n_defective} defective</span>
              {sel.metrics.errors.length > 0 && <Badge variant="warn">{sel.metrics.errors.length} errored</Badge>}
            </div>
            <dl className="num grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
              {([["Accuracy", sel.metrics.accuracy], ["Precision", sel.metrics.precision], ["Recall", sel.metrics.recall], ["F1", sel.metrics.f1], ["Pixel IoU", sel.metrics.pixel_iou], ["Pixel Dice", sel.metrics.pixel_dice], ["Time", sel.metrics.seconds_per_image]] as [string, number | null | undefined][]).map(([k, v]) => (
                <div key={k}><dt className="font-sans text-muted-foreground">{k}</dt><dd className="text-sm font-semibold">{v == null ? "n/a" : k === "Time" ? `${v.toFixed(2)} s` : v.toFixed(3)}</dd></div>
              ))}
              <div><dt className="font-sans text-muted-foreground">TP / FP / TN / FN</dt><dd className="text-sm font-semibold">{sel.metrics.tp} / {sel.metrics.fp} / {sel.metrics.tn} / {sel.metrics.fn}</dd></div>
            </dl>
            {sel.metrics.errors.length > 0 && <p className="num text-[11px] text-warning">{sel.metrics.errors[0]}</p>}
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">Select a cell to see every metric for that method and category, including the confusion counts.</p>
        )}
      </Card>
    </div>
  );
}
