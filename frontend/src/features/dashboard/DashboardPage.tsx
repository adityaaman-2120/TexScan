import { Activity, CircleCheck, Shapes, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStats } from "@/api/hooks";
import { requireNav } from "@/app/nav";
import { EmptyState } from "@/components/EmptyState";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartTooltip, GRID, Legend, TICK } from "@/features/inspect/Charts";
import { DEFECT_LABELS } from "@/features/inspect/defectLabels";
import { RollKpis } from "@/features/rolls/RollKpis";
import { plural } from "@/lib/utils";
import { DEFECT_COLORS, defectSlices, formatMs, formatPercent, mostCommon } from "./defectColors";

const item = requireNav("/dashboard");
const RANGES = [7, 14, 30, 90] as const;

const shortDate = (iso: string): string => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function ChartCard({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="h-full gap-4">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data: stats, isPending, isError } = useStats(days);

  const slices = useMemo(() => defectSlices(stats?.defects_by_type ?? {}), [stats]);
  const topDefect = mostCommon(slices);
  const defectTotal = slices.reduce((s, x) => s + x.count, 0);
  const perDay = useMemo(() => stats?.inspections_per_day.map((d) => ({ date: d.date, total: d.total, failed: d.failed })) ?? [], [stats]);
  const anyDay = perDay.some((d) => d.total > 0);
  const profiles = stats?.by_profile ?? [];
  const passRate = stats?.pass_rate;
  const noData = !isPending && (isError || stats?.total === 0);

  return (
    <>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Total inspected" icon={<Activity />} loading={isPending} value={stats?.total.toLocaleString() ?? "—"} hint="all time" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Pass rate"
            icon={<CircleCheck />}
            loading={isPending}
            tone={passRate == null ? "neutral" : passRate >= 0.9 ? "pass" : passRate >= 0.7 ? "warn" : "fail"}
            value={passRate == null ? "—" : `${(passRate * 100).toFixed(1)}%`}
            hint={stats ? `${stats.passed.toLocaleString()} passed · ${stats.failed.toLocaleString()} failed` : undefined}
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Avg processing time" icon={<Timer />} loading={isPending} tone="accent" value={formatMs(stats?.avg_processing_ms)} hint="per inspection, all stages" />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Most common defect"
            icon={<Shapes />}
            loading={isPending}
            value={<span className="text-2xl">{topDefect ? DEFECT_LABELS[topDefect.type] : "—"}</span>}
            hint={topDefect ? `${plural(topDefect.count, "region")} (${formatPercent(topDefect.count, defectTotal)})` : "no defects recorded"}
          />
        </StaggerItem>

        <StaggerItem className="sm:col-span-2 lg:col-span-4">
          <ChartCard
            title="Inspections per day"
            description="How many images were inspected each day, and how many of them failed."
            action={<Segmented label="Time range" value={String(days)} onChange={(v) => setDays(Number(v) as (typeof RANGES)[number])} options={RANGES.map((r) => ({ value: String(r), label: `${r}d` }))} />}
          >
            {isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : !anyDay ? (
              <EmptyState illustration="chart" title={isError ? "Stats unavailable" : "Nothing inspected in this period"} description={isError ? "The API did not answer. Start the backend with make dev." : "Run an inspection and the daily counts show up here."} />
            ) : (
              <>
                <Legend items={[{ label: "Inspections", color: "var(--series-1)" }, { label: "Failed", color: "var(--series-2)" }]} />
                <div className="h-64" role="img" aria-label={`Inspections per day over the last ${days} days. ${stats?.total} in total.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={perDay} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={28} />
                      <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} width={36} />
                      <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<ChartTooltip title={(l) => shortDate(String(l))} />} />
                      <Line type="monotone" dataKey="total" name="Inspections" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="failed" name="Failed" stroke="var(--series-2)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <table className="sr-only">
                  <caption>Inspections per day</caption>
                  <thead><tr><th>Date</th><th>Inspections</th><th>Failed</th></tr></thead>
                  <tbody>{perDay.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.total}</td><td>{d.failed}</td></tr>)}</tbody>
                </table>
              </>
            )}
          </ChartCard>
        </StaggerItem>

        <StaggerItem className="sm:col-span-2">
          <ChartCard title="Defect types" description="What kind of defects the rules found, across every inspection.">
            {isPending ? (
              <Skeleton className="mx-auto size-48 rounded-full" />
            ) : slices.length === 0 ? (
              <EmptyState illustration="chart" title={noData ? "No defects recorded yet" : "No defects found"} description="Defect types appear here once an inspection finds something." />
            ) : (
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <div className="relative size-52 shrink-0" role="img" aria-label={`Defect types: ${slices.map((s) => `${s.count} ${DEFECT_LABELS[s.type]}`).join(", ")}.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<ChartTooltip title={() => "Defect type"} />} />
                      <Pie data={slices.map((s) => ({ name: DEFECT_LABELS[s.type], value: s.count, type: s.type }))} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
                        {slices.map((s) => <Cell key={s.type} fill={DEFECT_COLORS[s.type]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="num text-2xl font-semibold">{defectTotal.toLocaleString()}</span>
                    <span className="text-[11px] text-muted-foreground">defects</span>
                  </div>
                </div>
                <ul className="grid w-full min-w-0 flex-1 gap-2" aria-label="Defect type legend">
                  {slices.map((s) => (
                    <li key={s.type} className="flex items-center gap-3 text-sm">
                      <span className="size-3 shrink-0 rounded-sm" style={{ background: DEFECT_COLORS[s.type] }} aria-hidden />
                      <span className="truncate">{DEFECT_LABELS[s.type]}</span>
                      <span className="num ml-auto text-muted-foreground">{s.count.toLocaleString()}</span>
                      <span className="num w-10 text-right">{formatPercent(s.count, defectTotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ChartCard>
        </StaggerItem>

        <StaggerItem className="sm:col-span-2">
          <ChartCard title="Pass rate by profile" description="Share of inspections that passed, for each profile (and the defaults).">
            {isPending ? (
              <Skeleton className="h-52 w-full" />
            ) : profiles.length === 0 ? (
              <EmptyState illustration="profile" title="No inspections yet" description="Pass rates per profile appear once inspections exist." />
            ) : (
              <>
                <div style={{ height: Math.max(160, profiles.length * 44 + 24) }} role="img" aria-label={`Pass rate by profile: ${profiles.map((p) => `${p.name} ${Math.round(p.pass_rate * 100)} percent of ${p.total}`).join(", ")}.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profiles.map((p) => ({ ...p, pct: Math.round(p.pass_rate * 1000) / 10 }))} layout="vertical" margin={{ top: 2, right: 52, bottom: 0, left: 0 }} barCategoryGap={10}>
                      <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={TICK} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ ...TICK, fontFamily: "var(--font-sans)" }} axisLine={{ stroke: GRID }} tickLine={false} />
                      <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.5 }} content={<PassRateTooltip />} />
                      <Bar dataKey="pct" name="Pass rate" fill="var(--series-1)" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                        <LabelList dataKey="pct" position="right" formatter={(v: unknown) => `${v}%`} style={{ fill: "var(--foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className="sr-only">
                  <caption>Pass rate by profile</caption>
                  <thead><tr><th>Profile</th><th>Inspections</th><th>Passed</th><th>Pass rate</th></tr></thead>
                  <tbody>{profiles.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.total}</td><td>{p.passed}</td><td>{Math.round(p.pass_rate * 100)}%</td></tr>)}</tbody>
                </table>
              </>
            )}
          </ChartCard>
        </StaggerItem>
      </Stagger>
      <RollKpis />
    </>
  );
}

function PassRateTooltip({ active, payload }: { active?: boolean; payload?: { payload?: { name: string; total: number; passed: number; pct: number } }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 font-medium">{row.name}</div>
      <div className="num text-muted-foreground">
        {row.passed} of {row.total} passed · <span className="text-foreground">{row.pct}%</span>
      </div>
    </div>
  );
}
