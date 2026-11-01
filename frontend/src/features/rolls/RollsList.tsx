import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useRolls } from "@/api/hooks";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { plural } from "@/lib/utils";
import { formatMetres, formatPoints, metresToYards, formatYards, verdictOf } from "./rollMath";

type Filter = "all" | "open" | "complete";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Every roll, newest first, with a status filter and a search box. Shared by the Roll Inspection page and History. */
export function RollsList({ action }: { action?: React.ReactNode }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const { data: rolls } = useRolls({ ...(filter === "all" ? {} : { status: filter }), ...(q ? { q } : {}) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Show rolls"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "open", label: "In progress" },
            { value: "complete", label: "Complete" },
          ]}
        />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Roll ID, supplier or fabric" aria-label="Search rolls" className="max-w-64" />
        {action && <div className="ml-auto">{action}</div>}
      </div>

      {!rolls ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading rolls">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rolls.length === 0 ? (
        <Card>
          <EmptyState
            illustration="stack"
            title={filter === "all" && !q ? "No rolls yet" : "No rolls match"}
            description={filter === "all" && !q ? "Start a roll, add pictures along its length and get the four-point score." : "Try another filter or search."}
          />
        </Card>
      ) : (
        <ul className="space-y-2" aria-label="Rolls">
          {rolls.map((r) => {
            const verdict = verdictOf({ capture_count: r.capture_count, accepted: r.accepted });
            return (
              <li key={r.id}>
                <Link to={`/roll/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 outline-none transition-colors hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num truncate text-sm font-semibold">{r.code}</span>
                      <Badge variant={r.status === "complete" ? "default" : "muted"}>{r.status === "complete" ? "Complete" : "In progress"}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[r.supplier, r.fabric, r.profile_name].filter(Boolean).join(" · ") || "No supplier"} · {formatMetres(r.length_m)} ({formatYards(metresToYards(r.length_m))}) · {plural(r.capture_count, "picture")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-lg font-semibold leading-none">{formatPoints(r.points_per_100_sq_yd)}</div>
                    <div className="text-[11px] text-muted-foreground">points / 100 sq yd</div>
                  </div>
                  {verdict.tone === "neutral" ? (
                    <Badge variant="muted">Not inspected</Badge>
                  ) : (
                    <Badge variant={verdict.tone === "pass" ? "pass" : "fail"} className="num font-semibold">
                      {verdict.label.toUpperCase()}
                      {r.provisional ? " so far" : ""}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
