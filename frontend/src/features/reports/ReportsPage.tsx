import { useState } from "react";
import { Link } from "react-router-dom";
import { fileUrl } from "@/api/client";
import { useInspections } from "@/api/hooks";
import { requireNav } from "@/app/nav";
import { DecisionBadge } from "@/components/DecisionBadge";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ReportButton } from "@/components/ReportButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { plural } from "@/lib/utils";
import { groupBatches, passRate } from "./reports";

const item = requireNav("/reports");
const RECENT = 40; // single inspections listed
const BATCH_WINDOW = 200; // newest inspections scanned to find batches (the API maximum)

type Filter = "all" | "PASS" | "FAIL";

const when = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading reports">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

function SingleReports() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data } = useInspections({ limit: RECENT, ...(filter === "all" ? {} : { decision: filter }) });

  return (
    <div className="space-y-4">
      <Segmented
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "PASS", label: "Passed" },
          { value: "FAIL", label: "Failed" },
        ]}
      />
      {!data ? (
        <ListSkeleton />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            illustration="search"
            title="No inspections to report on"
            description={filter === "all" ? "Inspect a piece of fabric and its report will be available here." : "Nothing matches that filter."}
            action={
              <Button asChild>
                <Link to="/inspect">Inspect fabric</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-2" aria-label="Inspections">
            {data.items.map((row) => (
              <li key={row.id} className="flex items-center gap-3 rounded-xl border bg-card p-2.5 pr-3">
                <div className="size-11 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {row.thumbnail_url && <img src={fileUrl(row.thumbnail_url)} alt="" loading="lazy" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{row.filename}</div>
                  <div className="num text-xs text-muted-foreground">
                    {when(row.created_at)} · {plural(row.defect_count, "defect")}
                  </div>
                </div>
                <DecisionBadge decision={row.decision} />
                <ReportButton targets={[{ kind: "inspection", id: row.id }]} label="PDF" size="sm" />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {data.total > data.items.length ? `Showing the latest ${data.items.length} of ${data.total.toLocaleString()}. ` : ""}
            Older inspections are in <Link to="/history" className="text-primary underline-offset-4 hover:underline">History</Link>.
          </p>
        </>
      )}
    </div>
  );
}

function BatchReports() {
  const { data } = useInspections({ limit: BATCH_WINDOW });
  if (!data) return <ListSkeleton />;
  const batches = groupBatches(data.items);

  if (batches.length === 0) {
    return (
      <Card>
        <EmptyState
          illustration="stack"
          title="No batches yet"
          description="Check several photos at once and one combined report, with the failed pieces marked, will be available here."
          action={
            <Button asChild>
              <Link to="/batch">Check many photos</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Batches">
      {batches.map((b) => (
        <li key={b.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 pr-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Batch of {plural(b.total, "photo")}</div>
            <div className="num text-xs text-muted-foreground">
              {when(b.latest)} · {b.passed} passed · {b.failed} failed · {passRate(b)}% pass rate
            </div>
          </div>
          <ReportButton targets={[{ kind: "batch", id: b.id }]} label="PDF" size="sm" />
        </li>
      ))}
    </ul>
  );
}

export function ReportsPage() {
  return (
    <div>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />
      <Tabs defaultValue="single">
        <TabsList aria-label="Report type">
          <TabsTrigger value="single">Single inspections</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>
        <TabsContent value="single">
          <SingleReports />
        </TabsContent>
        <TabsContent value="batches">
          <BatchReports />
        </TabsContent>
      </Tabs>
    </div>
  );
}
