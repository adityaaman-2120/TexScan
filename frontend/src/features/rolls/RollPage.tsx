import { ArrowLeft, CircleCheck, CircleX, ExternalLink, Flag, RotateCcw, Settings, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { fileUrl } from "@/api/client";
import { useDeleteCapture, useDeleteRoll, useInspection, useRoll, useUpdateRoll } from "@/api/hooks";
import type { RollDefectOut, RollOut } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ReportButton } from "@/components/ReportButton";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFECT_LABELS } from "@/features/inspect/defectLabels";
import { cn, plural } from "@/lib/utils";
import { CaptureUploader } from "./CaptureUploader";
import { DefectMap, defectKey } from "./DefectMap";
import { RollSettingsDialog } from "./RollSettingsDialog";
import { formatMetres, formatPoints, formatYards, metresToYards, pointsColor, verdictOf } from "./rollMath";

const kindLabel = (type: string): string => (DEFECT_LABELS as Record<string, string>)[type] ?? "Unknown";

function Verdict({ roll }: { roll: RollOut }) {
  const s = roll.summary;
  const v = verdictOf(s);
  const Icon = v.tone === "pass" ? CircleCheck : CircleX;
  return (
    <Card className="gap-2 py-4">
      <div className="px-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Result</div>
      <div className="px-5">
        <div
          role="status"
          aria-label={`Roll result: ${v.label}`}
          className={cn("num flex items-center gap-2 text-3xl font-semibold leading-none", v.tone === "pass" && "text-success", v.tone === "fail" && "text-destructive", v.tone === "neutral" && "text-muted-foreground")}
        >
          {v.tone !== "neutral" && <Icon className="size-7" />}
          {v.label.toUpperCase()}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {s.capture_count === 0 ? "Add pictures to score the roll." : `${s.grade}${s.provisional ? " so far (the roll is not marked complete)" : ""}`}
        </p>
      </div>
    </Card>
  );
}

function SelectedDefect({ roll, defect }: { roll: RollOut; defect: RollDefectOut | undefined }) {
  const capture = roll.captures.find((c) => c.id === defect?.capture_id);
  const { data: inspection } = useInspection(capture?.inspection_id);
  if (!defect || !capture) {
    return (
      <Card className="h-full">
        <EmptyState illustration="search" title="Click a marker" description="Pick a defect on the strip to see the picture it was found in." />
      </Card>
    );
  }
  const box = inspection?.defects.find((d) => d.id === defect.defect_id)?.bbox;
  const w = inspection?.metrics.image_width ?? 0;
  const h = inspection?.metrics.image_height ?? 0;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {kindLabel(defect.defect_type)}
          <Badge variant="outline" className="num" style={{ color: pointsColor(defect.points) }}>
            {defect.points} {defect.points === 1 ? "point" : "points"}
          </Badge>
        </CardTitle>
        <CardDescription className="num">
          at {formatMetres(defect.position_m)} ({formatYards(defect.position_yd)}) · {defect.length_in.toFixed(1)} in ({defect.length_mm.toFixed(0)} mm) long
          {defect.continuous ? " · runs along the roll" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative overflow-hidden rounded-lg border bg-black/40">
          {capture.overlay_url ? <img src={fileUrl(capture.overlay_url)} alt={`Picture ${capture.filename} with the defects outlined`} className="mx-auto max-h-[22rem] w-auto max-w-full object-contain" /> : <Skeleton className="h-64 w-full" />}
          {box && w > 0 && h > 0 && capture.overlay_url && (
            <span aria-hidden className="pointer-events-none absolute rounded-sm ring-2 ring-primary" style={{ left: `${(box[0] / w) * 100}%`, top: `${(box[1] / h) * 100}%`, width: `${(box[2] / w) * 100}%`, height: `${(box[3] / h) * 100}%` }} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="num">
            {capture.filename} · metre mark {formatMetres(capture.position_m)}
          </span>
          <Button variant="outline" size="sm" className="ml-auto" asChild>
            <Link to={`/history?id=${capture.inspection_id}`}>
              <ExternalLink />
              Open in History
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DefectList({ roll, selectedKey, onSelect }: { roll: RollOut; selectedKey: string | null; onSelect: (key: string) => void }) {
  if (roll.defects.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No defects scored yet.</p>;
  return (
    <div className="max-h-96 overflow-auto rounded-lg border">
      <table className="w-full text-[13px]">
        <caption className="sr-only">Defects of the roll with position, type, length and points</caption>
        <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="px-3 py-2 font-medium">#</th>
            <th scope="col" className="px-3 py-2 font-medium">Position</th>
            <th scope="col" className="px-3 py-2 font-medium">Type</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Length</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {roll.defects.map((d, i) => {
            const key = defectKey(d);
            return (
              <tr
                key={key}
                tabIndex={0}
                aria-selected={key === selectedKey}
                onClick={() => onSelect(key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(key);
                  }
                }}
                className={cn("cursor-pointer border-b border-border/50 outline-none transition-colors last:border-0 hover:bg-accent/60 focus-visible:bg-accent", key === selectedKey && "bg-primary/10")}
              >
                <td className="num px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="num px-3 py-2">
                  {formatMetres(d.position_m)}
                  <span className="ml-1.5 text-xs text-muted-foreground">{formatYards(d.position_yd)}</span>
                </td>
                <td className="px-3 py-2">
                  {kindLabel(d.defect_type)}
                  {d.continuous && <span className="ml-1.5 text-xs text-muted-foreground">continuous</span>}
                </td>
                <td className="num px-3 py-2 text-right">
                  {d.length_in.toFixed(1)} in<span className="block text-[11px] text-muted-foreground">{d.length_mm.toFixed(0)} mm</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="num inline-flex items-center gap-1.5 font-semibold">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: pointsColor(d.points) }} />
                    {d.points}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Captures({ roll }: { roll: RollOut }) {
  const remove = useDeleteCapture(roll.id);
  const [confirming, setConfirming] = useState<number | null>(null);
  if (roll.captures.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No pictures yet.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Pictures of the roll">
      {roll.captures.map((c) => (
        <li key={c.id} className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
          <div className="size-14 shrink-0 overflow-hidden rounded-md border bg-muted">{c.thumbnail_url && <img src={fileUrl(c.thumbnail_url)} alt="" loading="lazy" className="size-full object-cover" />}</div>
          <div className="min-w-0 flex-1">
            <div className="num text-sm font-medium">{formatMetres(c.position_m)}</div>
            <div className="truncate text-xs text-muted-foreground">
              {c.filename} · {plural(c.defect_count, "defect")}
            </div>
          </div>
          {confirming === c.id ? (
            <div className="flex items-center gap-1">
              <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(c.id, { onSuccess: () => { setConfirming(null); toast.success("Picture removed"); } })}>
                Remove
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label={`Remove picture at ${formatMetres(c.position_m)}`} className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming(c.id)}>
              <Trash2 />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One roll: score, defect map, defects, pictures. */
export function RollPage() {
  const { id } = useParams();
  const rollId = Number(id);
  const navigate = useNavigate();
  const { data: roll, isPending } = useRoll(Number.isFinite(rollId) ? rollId : undefined);
  const update = useUpdateRoll(rollId);
  const del = useDeleteRoll();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setSelectedKey(null), [rollId]);

  const back = (
    <Button variant="outline" size="sm" asChild>
      <Link to="/roll">
        <ArrowLeft />
        Rolls
      </Link>
    </Button>
  );

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading roll">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!roll) {
    return (
      <Card>
        <CardContent>
          <EmptyState illustration="stack" title="That roll does not exist" description="It may have been deleted." action={back} />
        </CardContent>
      </Card>
    );
  }

  const s = roll.summary;
  const complete = roll.status === "complete";
  const selected = roll.defects.find((d) => defectKey(d) === selectedKey);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ArrowLeft}
        title={`Roll ${roll.code}`}
        description={[roll.supplier, roll.fabric, `${roll.width_in.toFixed(1)} in wide`, `${roll.length_yd.toFixed(1)} yd (${roll.length_m} m)`].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {back}
            <ReportButton targets={[{ kind: "roll", id: roll.id }]} label="Download report" />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={complete ? "default" : "muted"} dot>
          {complete ? "Complete" : "In progress"}
        </Badge>
        {roll.profile_name && <Badge variant="outline">Profile: {roll.profile_name}</Badge>}
        <Button size="sm" variant={complete ? "outline" : "default"} disabled={update.isPending} onClick={() => update.mutate({ status: complete ? "open" : "complete" }, { onSuccess: () => toast.success(complete ? "Roll opened again" : "Roll marked complete") })}>
          {complete ? <RotateCcw /> : <Flag />}
          {complete ? "Open again" : "Finish roll"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSettings(true)}>
          <Settings />
          Settings
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-muted-foreground">Delete this roll and its pictures?</span>
              <Button size="sm" variant="destructive" disabled={del.isPending} onClick={() => del.mutate(roll.id, { onSuccess: () => { toast.success("Roll deleted"); navigate("/roll"); } })}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Verdict roll={roll} />
        <StatCard label="Points / 100 sq yd" value={formatPoints(s.points_per_100_sq_yd)} hint={`limit ${roll.limit}`} tone={s.capture_count === 0 ? "neutral" : s.accepted ? "pass" : "fail"} />
        <StatCard label="Total points" value={s.total_points} hint={s.raw_points > s.total_points ? `${s.raw_points} before the 4 per yard cap` : plural(s.defect_count, "defect")} />
        <StatCard label="Inspected" value={formatYards(metresToYards(s.length_inspected_m))} hint={`${s.coverage_percent.toFixed(0)}% of the roll covered · ${plural(s.capture_count, "picture")}`} />
      </div>

      {s.warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-[12.5px] text-warning" aria-label="Warnings">
          {s.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Defect map</CardTitle>
            <CardDescription>The roll from start to end. Click a marker to see its picture.</CardDescription>
          </CardHeader>
          <CardContent>
            <DefectMap roll={roll} selectedKey={selectedKey} onSelect={setSelectedKey} />
          </CardContent>
        </Card>
        <SelectedDefect roll={roll} defect={selected} />
      </div>

      <CaptureUploader roll={roll} />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Defects</CardTitle>
          <CardDescription>Points follow the four-point rules: by length, at most 4 per yard. Click a row to see it on the map.</CardDescription>
        </CardHeader>
        <CardContent>
          <DefectList roll={roll} selectedKey={selectedKey} onSelect={setSelectedKey} />
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Pictures</CardTitle>
        </CardHeader>
        <CardContent>
          <Captures roll={roll} />
        </CardContent>
      </Card>

      <RollSettingsDialog key={roll.updated_at} roll={roll} open={settings} onOpenChange={setSettings} />
    </div>
  );
}
