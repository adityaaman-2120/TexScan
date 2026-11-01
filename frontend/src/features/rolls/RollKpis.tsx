import { ClipboardCheck, Gauge, Layers2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useRollStats } from "@/api/hooks";
import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFECT_LABELS } from "@/features/inspect/defectLabels";
import { formatPoints } from "./rollMath";

const kindLabel = (type: string): string => (DEFECT_LABELS as Record<string, string>)[type] ?? type;

/** Roll KPIs for the Dashboard: rolls inspected, acceptance rate, average points, defect types by supplier. */
export function RollKpis() {
  const { data, isPending } = useRollStats();
  const none = !isPending && (!data || data.rolls_inspected === 0);
  const rate = data?.acceptance_rate;

  return (
    <section aria-labelledby="roll-kpis" className="mt-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="roll-kpis" className="text-sm font-semibold">
          Roll inspection
        </h2>
        <Button variant="outline" size="sm" asChild>
          <Link to="/roll">Open rolls</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Rolls inspected" icon={<Layers2 />} loading={isPending} value={data?.rolls_inspected.toLocaleString() ?? "—"} hint={data ? `${data.rolls_open} in progress` : undefined} />
        <StatCard
          label="Acceptance rate"
          icon={<ClipboardCheck />}
          loading={isPending}
          value={rate == null ? "—" : `${rate.toFixed(rate % 1 === 0 ? 0 : 1)}%`}
          tone={rate == null ? "neutral" : rate >= 90 ? "pass" : rate >= 70 ? "warn" : "fail"}
          hint={data ? `${data.accepted} accepted · ${data.rejected} rejected` : undefined}
        />
        <StatCard
          label="Avg points / 100 sq yd"
          icon={<Gauge />}
          loading={isPending}
          value={data?.avg_points_per_100_sq_yd == null ? "—" : formatPoints(data.avg_points_per_100_sq_yd)}
          hint="completed rolls, four-point system"
        />
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Top defect types by supplier</CardTitle>
          <CardDescription>From completed rolls. The most common defects found in each supplier&apos;s rolls.</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : none || !data ? (
            <EmptyState illustration="chart" title="No completed rolls yet" description="Finish a roll and its supplier appears here." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-[13px]">
                <caption className="sr-only">Rolls, acceptance, average points and the commonest defect types per supplier</caption>
                <thead className="bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="px-3 py-2 font-medium">Supplier</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Rolls</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Accepted</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Avg pts / 100 sq yd</th>
                    <th scope="col" className="px-3 py-2 font-medium">Top defect types</th>
                  </tr>
                </thead>
                <tbody>
                  {data.suppliers.map((s) => (
                    <tr key={s.supplier} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-medium">{s.supplier}</td>
                      <td className="num px-3 py-2 text-right">{s.rolls}</td>
                      <td className="num px-3 py-2 text-right">
                        {s.accepted} / {s.rolls}
                      </td>
                      <td className="num px-3 py-2 text-right">{formatPoints(s.avg_points_per_100_sq_yd)}</td>
                      <td className="px-3 py-2">
                        {s.top_defect_types.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No defects</span>
                        ) : (
                          <ul className="flex flex-wrap gap-1.5">
                            {s.top_defect_types.map((t) => (
                              <li key={t.defect_type}>
                                <Badge variant="outline" className="num">
                                  {kindLabel(t.defect_type)} {t.count}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
