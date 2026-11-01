import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fileUrl } from "@/api/client";
import { useInspections, useProfiles, type InspectionListParams } from "@/api/hooks";
import { METHOD_LABELS, type Method } from "@/api/types";
import { requireNav } from "@/app/nav";
import { DecisionBadge } from "@/components/DecisionBadge";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RollsList } from "@/features/rolls/RollsList";
import { useMethodLabel } from "@/lib/methodLabel";
import { cn, plural } from "@/lib/utils";
import { InspectionDrawer } from "./InspectionDrawer";

const item = requireNav("/history");
const PAGE_SIZE = 20;
const ALL = "all";
const METHODS = Object.keys(METHOD_LABELS) as Method[];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

const COLUMNS = (
  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
    <th scope="col" className="w-14 px-3 py-2.5 font-medium"><span className="sr-only">Preview</span></th>
    <th scope="col" className="px-3 py-2.5 font-medium">File</th>
    <th scope="col" className="px-3 py-2.5 font-medium">Decision</th>
    <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Defects</th>
    <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Scan type</th>
    <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Profile</th>
    <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Date</th>
  </tr>
);

function InspectionsHistory() {
  const labelOf = useMethodLabel();
  const [search, setSearch] = useSearchParams();
  const openId = Number(search.get("id")) || undefined;
  const batchId = search.get("batch") ?? undefined;

  const [decision, setDecision] = useState<string>(ALL);
  const [method, setMethod] = useState<string>(ALL);
  const [profile, setProfile] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [page, setPage] = useState(0);
  const q = useDebounced(text.trim(), 300);

  const { data: profiles } = useProfiles();
  const profileName = useCallback((id: number | null) => (id === null ? "Defaults" : (profiles?.find((p) => p.id === id)?.name ?? `#${id}`)), [profiles]);

  const params: InspectionListParams = useMemo(
    () => ({
      decision: decision === ALL ? undefined : (decision as "PASS" | "FAIL"),
      method: method === ALL ? undefined : method,
      profile_id: profile === ALL ? undefined : Number(profile),
      q: q || undefined,
      batch_id: batchId,
      date_from: from || undefined,
      date_to: to || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [decision, method, profile, q, batchId, from, to, page],
  );
  const { data, isPending, isError, isPlaceholderData } = useInspections(params);

  // any filter change goes back to the first page
  useEffect(() => setPage(0), [decision, method, profile, q, batchId, from, to]);

  const filtersActive = decision !== ALL || method !== ALL || profile !== ALL || q !== "" || from !== "" || to !== "" || batchId !== undefined;
  const clearFilters = () => {
    setDecision(ALL);
    setMethod(ALL);
    setProfile(ALL);
    setText("");
    setFrom("");
    setTo("");
    setSearch((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("batch");
      return next;
    });
  };

  const openDrawer = (id: number) => setSearch((prev) => new URLSearchParams({ ...Object.fromEntries(prev), id: String(id) }));
  const closeDrawer = () =>
    setSearch((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("id");
      return next;
    });

  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <>
      <Card className="mb-4 gap-3 p-3 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search file names…" aria-label="Search file names" className="pl-9 pr-9" />
            {text && (
              <button type="button" onClick={() => setText("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Segmented
            label="Decision"
            value={decision}
            onChange={setDecision}
            options={[{ value: ALL, label: "All" }, { value: "PASS", label: "Pass" }, { value: "FAIL", label: "Fail" }]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-44" aria-label="Filter by scan type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All scan types</SelectItem>
              {METHODS.map((m) => <SelectItem key={m} value={m}>{labelOf(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={profile} onValueChange={setProfile}>
            <SelectTrigger className="w-44" aria-label="Filter by profile"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All profiles</SelectItem>
              {profiles?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            From <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="From date" />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            To <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="To date" />
          </label>
          {batchId && (
            <Badge variant="default" className="gap-1.5 py-1">
              One batch only
              <button type="button" aria-label="Show all batches" onClick={() => setSearch((p) => { const n = new URLSearchParams(p); n.delete("batch"); return n; })}><X className="size-3" /></button>
            </Badge>
          )}
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      <Card className={cn("gap-0 overflow-hidden py-0 transition-opacity", isPlaceholderData && "opacity-60")}>
        {isPending ? (
          <table className="w-full">
            <thead>{COLUMNS}</thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-2.5"><Skeleton className="size-10" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-40 max-w-full" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-5 w-14" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="ml-auto h-4 w-8" /></td>
                  <td className="hidden px-3 py-2.5 md:table-cell"><Skeleton className="h-4 w-24" /></td>
                  <td className="hidden px-3 py-2.5 lg:table-cell"><Skeleton className="h-4 w-20" /></td>
                  <td className="hidden px-3 py-2.5 sm:table-cell"><Skeleton className="h-4 w-32" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            illustration="history"
            title={isError ? "History unavailable" : filtersActive ? "No inspections match" : "No inspections yet"}
            description={isError ? "The API did not answer. Start the backend with make dev." : filtersActive ? "Try a different search or clear the filters." : "Every inspection you run is stored here with its images."}
            action={
              !isError &&
              (filtersActive ? (
                <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
              ) : (
                <Button asChild size="sm"><Link to="/inspect">Run an inspection</Link></Button>
              ))
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>{COLUMNS}</thead>
            <tbody>
              {data.items.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  onClick={() => openDrawer(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDrawer(row.id);
                    }
                  }}
                  aria-label={`Open ${row.filename}: ${row.decision}`}
                  className={cn("cursor-pointer border-b outline-none transition-colors last:border-0 hover:bg-accent/50 focus-visible:bg-accent", row.id === openId && "bg-primary/10")}
                >
                  <td className="px-3 py-2">
                    {row.thumbnail_url ? <img src={fileUrl(row.thumbnail_url)} alt="" loading="lazy" className="size-10 rounded-md border object-cover" /> : <div className="size-10 rounded-md border bg-muted" />}
                  </td>
                  <td className="max-w-0 px-3 py-2">
                    <div className="truncate font-medium">{row.filename}</div>
                    <div className="num truncate text-[11px] text-muted-foreground sm:hidden">{plural(row.defect_count, "defect")} · {new Date(row.created_at).toLocaleDateString()}</div>
                    <div className="num hidden text-[11px] text-muted-foreground sm:block">#{row.id}</div>
                  </td>
                  <td className="px-3 py-2"><DecisionBadge decision={row.decision} /></td>
                  <td className="num hidden px-3 py-2 text-right sm:table-cell">{row.defect_count.toLocaleString()}</td>
                  <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{labelOf(row.method)}</td>
                  <td className="hidden px-3 py-2 text-muted-foreground lg:table-cell">{profileName(row.profile_id)}</td>
                  <td className="num hidden whitespace-nowrap px-3 py-2 text-xs text-muted-foreground sm:table-cell">{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5">
            <span className="num text-xs text-muted-foreground" aria-live="polite">
              {first}–{last} of {total.toLocaleString()} {plural(total, "inspection").replace(/^\d+ /, "")}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
              <span className="num px-2 text-xs">{page + 1} / {lastPage + 1}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page >= lastPage} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
            </div>
          </div>
        )}
      </Card>

      <InspectionDrawer id={openId} onClose={closeDrawer} profileName={profileName} />
    </>
  );
}

/** History: past inspections and graded rolls. */
export function HistoryPage() {
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab") === "rolls" ? "rolls" : "inspections";
  return (
    <>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />
      <Tabs value={tab} onValueChange={(v) => setSearch(v === "rolls" ? { tab: "rolls" } : {})}>
        <TabsList aria-label="History">
          <TabsTrigger value="inspections">Inspections</TabsTrigger>
          <TabsTrigger value="rolls">Rolls</TabsTrigger>
        </TabsList>
        <TabsContent value="inspections">
          <InspectionsHistory />
        </TabsContent>
        <TabsContent value="rolls">
          <RollsList />
        </TabsContent>
      </Tabs>
    </>
  );
}
