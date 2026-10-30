import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RobustnessPoint } from "@/api/types";
import { ChartTooltip, GRID, TICK } from "@/features/inspect/Charts";
import { decisionRanges, DEGRADATIONS, formatBytes, formatLevel, type Degradation } from "./levels";

const sorted = (points: RobustnessPoint[]) => [...points].sort((a, b) => a.level - b.level);

/** PASS is a hollow green circle, FAIL a filled red diamond: the verdict is readable by shape, not only by colour. */
function VerdictDot(props: { cx?: number; cy?: number; payload?: RobustnessPoint }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return <g />;
  return payload.decision === "PASS" ? (
    <circle cx={cx} cy={cy} r={5} fill="var(--card)" stroke="var(--success)" strokeWidth={2} />
  ) : (
    <path d={`M${cx} ${cy - 6.5} L${cx + 6.5} ${cy} L${cx} ${cy + 6.5} L${cx - 6.5} ${cy} Z`} fill="var(--destructive)" stroke="var(--card)" strokeWidth={1.5} />
  );
}

export function VerdictLegend() {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: "var(--series-1)" }} aria-hidden />Defect area</li>
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-success bg-card" aria-hidden />PASS</li>
      <li className="flex items-center gap-1.5"><span className="size-2.5 rotate-45 bg-destructive" aria-hidden />FAIL</li>
    </ul>
  );
}

/** Defect area % against degradation level, each point marked with the verdict at that level. One axis only. */
export function DegradationChart({ kind, points }: { kind: Degradation; points: RobustnessPoint[] }) {
  const data = sorted(points);
  const ranges = decisionRanges(data).filter((r) => r.decision === "FAIL");
  const info = DEGRADATIONS[kind];
  return (
    <div>
      <VerdictLegend />
      <div className="h-64" role="img" aria-label={`Defect area percent and verdict against ${info.axis}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
            {ranges.map((r) => (
              <ReferenceArea key={`${r.from}-${r.to}`} x1={r.from} x2={r.to} fill="var(--destructive)" fillOpacity={0.07} stroke="none" ifOverflow="extendDomain" />
            ))}
            <XAxis dataKey="level" type="number" domain={["dataMin", "dataMax"]} ticks={data.map((p) => p.level)} tickFormatter={(v: number) => formatLevel(kind, v)} tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} label={{ value: info.axis, position: "insideBottom", offset: -12, fill: "var(--muted-foreground)", fontSize: 11 }} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => `${Number(v.toFixed(2))}%`} domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as RobustnessPoint | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
                    <div className="num mb-1 text-muted-foreground">{info.axis.split(" (")[0]} = {formatLevel(kind, p.level)}</div>
                    <div className="num flex gap-3"><span className="text-muted-foreground">defect area</span><span>{p.defect_area_percent.toFixed(3)}%</span></div>
                    <div className="num flex gap-3"><span className="text-muted-foreground">regions</span><span>{p.defect_count}</span></div>
                    <div className={`num mt-1 font-semibold ${p.decision === "PASS" ? "text-success" : "text-destructive"}`}>{p.decision}</div>
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey="defect_area_percent" stroke="var(--series-1)" strokeWidth={2} dot={<VerdictDot />} activeDot={<VerdictDot />} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Verdict and defect area by level</caption>
        <thead><tr><th>Level</th><th>Verdict</th><th>Defect area %</th><th>Regions</th></tr></thead>
        <tbody>{data.map((p) => <tr key={p.level}><td>{formatLevel(kind, p.level)}</td><td>{p.decision}</td><td>{p.defect_area_percent.toFixed(3)}</td><td>{p.defect_count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

interface MiniProps {
  title: string;
  caption: string;
  kind: Degradation;
  points: RobustnessPoint[];
  value: (p: RobustnessPoint) => number | null | undefined;
  format: (v: number) => string;
  unit?: string;
  domain?: [number | "auto", number | "auto"];
}

/** A small single-series chart (small multiples share the same x axis). */
function MiniChart({ title, caption, kind, points, value, format, domain }: MiniProps) {
  const data = sorted(points).map((p) => ({ level: p.level, v: value(p) ?? null }));
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11.5px] leading-snug text-muted-foreground">{caption}</div>
      </figcaption>
      <div className="h-40" role="img" aria-label={`${title} against ${DEGRADATIONS[kind].axis}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="level" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => formatLevel(kind, v)} tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={TICK} axisLine={false} tickLine={false} width={42} tickFormatter={(v: number) => format(v)} domain={domain ?? ["auto", "auto"]} />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<ChartTooltip title={(l) => `${DEGRADATIONS[kind].label} ${formatLevel(kind, Number(l))}`} />} formatter={undefined} />
            <Line type="monotone" dataKey="v" name={title} stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** How much the picture itself changed (and, for JPEG, what it cost on disk). */
export function QualityCharts({ kind, points, rawBytes }: { kind: Degradation; points: RobustnessPoint[]; rawBytes: number }) {
  const jpeg = kind === "jpeg_quality";
  return (
    <div className={`grid gap-6 ${jpeg ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
      {jpeg && (
        <MiniChart
          title="File size"
          caption={`JPEG size against quality; the raw pixels are ${formatBytes(rawBytes)}.`}
          kind={kind}
          points={points}
          value={(p) => (p.file_bytes == null ? null : p.file_bytes / 1024)}
          format={(v) => `${Math.round(v)}K`}
          domain={[0, "auto"]}
        />
      )}
      <MiniChart title="PSNR" caption="Peak signal-to-noise ratio against the original, in dB. Higher means closer." kind={kind} points={points} value={(p) => p.psnr} format={(v) => `${Math.round(v)}`} />
      <MiniChart title="SSIM" caption="Structural similarity to the original, from 0 to 1. Higher means closer." kind={kind} points={points} value={(p) => p.ssim} format={(v) => v.toFixed(2)} domain={[0, 1]} />
    </div>
  );
}
