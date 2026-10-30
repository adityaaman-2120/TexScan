import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProfileOut } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { Segmented } from "@/components/ui/segmented";
import { ChartTooltip, GRID, TICK } from "@/features/inspect/Charts";
import { formatShare, shareAbove, toBins } from "./histogram";

type Report = ProfileOut["report"];

const PERCENTILES = ["p50", "p99", "p99.5", "p99.9", "max"] as const;

/**
 * Where the good samples' scores fall and where the learned threshold cuts them.
 * Score is what the method measures per pixel; anything above the dashed line counts as defect (then the area filter decides).
 */
export function ScoreHistogram({ report }: { report: Report }) {
  const [scale, setScale] = useState<"sqrt" | "linear">("sqrt");
  const histogram = report.score_histogram;
  const bins = useMemo(() => (histogram ? toBins(histogram) : []), [histogram]);
  const above = histogram ? shareAbove(histogram, report.threshold) : 0;
  const unit = report.threshold_param.endsWith(".k") ? "robust deviations" : "gray levels";

  if (!histogram) {
    return (
      <EmptyState
        illustration="chart"
        title="No histogram stored for this profile"
        description="It was learned before score histograms were recorded. Learn it again from the same good images to see the distribution."
      />
    );
  }

  const data = bins.map((b) => ({ score: b.mid, count: b.count, lo: b.lo, hi: b.hi }));
  const last = histogram.edges[histogram.edges.length - 1]!;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: "var(--series-1)" }} aria-hidden />Good-sample scores (all images)</li>
          <li className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: "var(--series-2)" }} aria-hidden />Learned threshold</li>
        </ul>
        <Segmented label="Count scale" value={scale} onChange={setScale} options={[{ value: "sqrt", label: "Square root" }, { value: "linear", label: "Linear" }]} />
      </div>
      <div className="h-64" role="img" aria-label={`Histogram of good-sample scores with the learned threshold at ${report.threshold.toFixed(2)}. About ${formatShare(above)} of good-sample pixels score above it.`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 22, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="score" type="number" domain={[0, last]} tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} tickFormatter={(v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))} label={{ value: `score (${unit})`, position: "insideBottom", offset: -12, fill: "var(--muted-foreground)", fontSize: 11 }} />
            <YAxis scale={scale} domain={[0, "auto"]} tick={TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<ChartTooltip title={(l) => `score ≈ ${Number(l).toFixed(1)}`} unit=" px" />} />
            <Area type="stepAfter" dataKey="count" name="Pixels" stroke="var(--series-1)" strokeWidth={1.5} fill="var(--series-1)" fillOpacity={0.18} isAnimationActive={false} />
            <ReferenceLine x={report.threshold} stroke="var(--series-2)" strokeWidth={2} strokeDasharray="6 4" label={{ value: `threshold ${report.threshold.toFixed(2)}`, position: "top", fill: "var(--foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
        About <span className="num text-foreground">{formatShare(above)}</span> of the good samples' pixels score above the line; the minimum-area filter ({report.min_area} px) removes the small clumps they form.
        {histogram.clipped && " Scores beyond the last bar are counted in it."}
      </p>

      <dl className="num mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        {PERCENTILES.map((k) => (
          report.score_percentiles[k] !== undefined && (
            <div key={k} className="flex gap-2"><dt className="text-muted-foreground">{k}</dt><dd>{report.score_percentiles[k]!.toFixed(1)}</dd></div>
          )
        ))}
      </dl>
      <table className="sr-only">
        <caption>Good-sample score percentiles</caption>
        <thead><tr><th>Percentile</th><th>Score</th></tr></thead>
        <tbody>{PERCENTILES.map((k) => <tr key={k}><td>{k}</td><td>{report.score_percentiles[k]?.toFixed(2)}</td></tr>)}<tr><td>threshold</td><td>{report.threshold.toFixed(2)}</td></tr></tbody>
      </table>
    </div>
  );
}
