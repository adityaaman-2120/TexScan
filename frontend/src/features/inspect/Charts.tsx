import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* Colors: --series-1 / --series-2 are the validated categorical slots 1 and 2 (see index.css).
   Text stays in text tokens, never in a series color; identity is carried by legend + position, not color alone. */

export const TICK = { fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" };
export const GRID = "var(--border)";

export function ChartTooltip({ active, payload, label, title, unit = "" }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string | number; title: (l: string | number) => string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="num mb-1 text-muted-foreground">{title(label ?? "")}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="num ml-auto pl-4 text-foreground">
            {Math.round(p.value ?? 0).toLocaleString()}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function stats(hist: number[]): { mean: number; std: number; used: number } {
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  const mean = hist.reduce((s, c, k) => s + c * k, 0) / total;
  const variance = hist.reduce((s, c, k) => s + c * (k - mean) ** 2, 0) / total;
  return { mean, std: Math.sqrt(variance), used: hist.filter((c) => c > 0).length };
}

export function HistogramChart({ before, after, enhanceMethod }: { before: number[]; after: number[]; enhanceMethod: string }) {
  const data = useMemo(() => before.map((b, k) => ({ level: k, before: b, after: after[k] ?? 0 })), [before, after]);
  const sb = useMemo(() => stats(before), [before]);
  const sa = useMemo(() => stats(after), [after]);
  const label = enhanceMethod === "none" ? "After (enhancement off)" : "After enhancement";

  return (
    <div>
      <Legend items={[{ label: "Before enhancement", color: "var(--series-2)" }, { label, color: "var(--series-1)" }]} />
      <div className="h-52" role="img" aria-label={`Gray-level histogram before and after enhancement. Mean level ${sb.mean.toFixed(0)} before, ${sa.mean.toFixed(0)} after.`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="level" type="number" domain={[0, 255]} ticks={[0, 64, 128, 192, 255]} tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<ChartTooltip title={(l) => `gray level ${l}`} unit=" px" />} />
            <Area type="monotone" dataKey="before" name="Before" stroke="var(--series-2)" strokeWidth={1.5} fill="var(--series-2)" fillOpacity={0.12} isAnimationActive={false} />
            <Area type="monotone" dataKey="after" name="After" stroke="var(--series-1)" strokeWidth={1.5} fill="var(--series-1)" fillOpacity={0.12} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="num mt-2 text-xs text-muted-foreground">
        mean {sb.mean.toFixed(0)} → {sa.mean.toFixed(0)} · spread σ {sb.std.toFixed(0)} → {sa.std.toFixed(0)} · levels used {sb.used} → {sa.used}
      </p>
      <table className="sr-only">
        <caption>Histogram summary</caption>
        <thead>
          <tr><th>Series</th><th>Mean level</th><th>Std deviation</th><th>Levels used</th></tr>
        </thead>
        <tbody>
          <tr><td>Before</td><td>{sb.mean.toFixed(1)}</td><td>{sb.std.toFixed(1)}</td><td>{sb.used}</td></tr>
          <tr><td>After</td><td>{sa.mean.toFixed(1)}</td><td>{sa.std.toFixed(1)}</td><td>{sa.used}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function TimingChart({ timings }: { timings: Record<string, number> }) {
  const rows = useMemo(() => Object.entries(timings).map(([step, ms]) => ({ step: step.replace(/_/g, " "), ms: Math.round(ms * 10) / 10 })), [timings]);
  const total = rows.reduce((s, r) => s + r.ms, 0);
  const slowest = rows.reduce((a, b) => (b.ms > a.ms ? b : a), rows[0]!);

  return (
    <div>
      <p className="num mb-2 text-xs text-muted-foreground">
        total {total.toFixed(0)} ms · slowest: {slowest.step} ({slowest.ms} ms)
      </p>
      <div style={{ height: Math.max(180, rows.length * 26 + 20) }} role="img" aria-label={`Time spent per pipeline step, ${total.toFixed(0)} milliseconds in total.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 2, right: 48, bottom: 0, left: 0 }} barCategoryGap={6}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal={false} />
            <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}`} />
            <YAxis type="category" dataKey="step" tick={{ ...TICK, fontFamily: "var(--font-sans)", fill: "var(--muted-foreground)" }} axisLine={{ stroke: GRID }} tickLine={false} width={132} />
            <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.5 }} content={<ChartTooltip title={(l) => String(l)} unit=" ms" />} />
            <Bar dataKey="ms" name="Time" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false}>
              <LabelList dataKey="ms" position="right" formatter={(v: unknown) => `${v}`} style={{ fill: "var(--foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Time per pipeline step in milliseconds</caption>
        <thead>
          <tr><th>Step</th><th>Milliseconds</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.step}><td>{r.step}</td><td>{r.ms}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
