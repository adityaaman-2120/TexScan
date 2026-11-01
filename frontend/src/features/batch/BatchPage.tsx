import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleX, Download, FolderOpen, Images, Play, RotateCcw, TriangleAlert, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ProfileSelector } from "@/app/ProfileSelector";
import { requireNav } from "@/app/nav";
import type { Method } from "@/api/types";
import { useMethodLabel } from "@/lib/methodLabel";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportButton } from "@/components/ReportButton";
import { downloadText } from "@/lib/csv";
import { cn, plural } from "@/lib/utils";
import { useUi } from "@/store/ui";
import { BatchTile } from "./BatchTile";
import { fromDataTransfer, fromFileList, type PickResult } from "./pickFiles";
import { useBatchRun } from "./useBatchRun";

const item = requireNav("/batch");
const METHODS: Method[] = ["fft", "gabor", "local_statistics"]; // golden_template needs a reference image per run

const formatDuration = (ms: number): string => (ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function Picker({ onPick }: { onPick: (result: PickResult) => void }) {
  const folder = useRef<HTMLInputElement>(null);
  const many = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void fromDataTransfer(e.dataTransfer).then(onPick);
      }}
      className={cn(
        "flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
        over ? "border-primary bg-primary/10" : "border-border bg-card/50",
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
        <UploadCloud className="size-7" />
      </div>
      <div>
        <p className="text-base font-semibold">{over ? "Release to add" : "Drop a folder or many images"}</p>
        <p className="mt-1 text-sm text-muted-foreground">Folders are searched recursively; anything that is not an image is skipped.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => folder.current?.click()}>
          <FolderOpen />
          Choose folder
        </Button>
        <Button variant="outline" onClick={() => many.current?.click()}>
          <Images />
          Choose images
        </Button>
      </div>
      {/* webkitdirectory is not in React's input typings */}
      <input ref={folder} type="file" className="sr-only" tabIndex={-1} {...({ webkitdirectory: "", directory: "" } as object)} onChange={(e) => { onPick(fromFileList(e.target.files ?? [])); e.target.value = ""; }} />
      <input ref={many} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => { onPick(fromFileList(e.target.files ?? [])); e.target.value = ""; }} />
    </div>
  );
}

export function BatchPage() {
  const labelOf = useMethodLabel();
  const navigate = useNavigate();
  const profileId = useUi((s) => s.profileId);
  const batch = useBatchRun();
  const [staged, setStaged] = useState<PickResult | null>(null);
  const [method, setMethod] = useState<Method>("gabor");
  const [exporting, setExporting] = useState(false);

  const { items, phase, summary } = batch;
  const running = phase === "running";
  const now = useNow(running);
  const elapsed = (phase === "complete" ? batch.finishedAt : now) - batch.startedAt;

  const pick = (result: PickResult) => {
    if (result.images.length === 0) {
      toast.error("No images found", { description: result.skipped ? `${plural(result.skipped, "file")} skipped: not images.` : "Nothing was selected." });
      return;
    }
    setStaged(result);
  };

  const begin = () => {
    if (!staged) return;
    void batch.start(staged.images, { method, profileId });
    setStaged(null);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      downloadText(`texscan-batch-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`, await batch.exportCsv());
    } finally {
      setExporting(false);
    }
  };

  const open = (id: number) => navigate(`/history?id=${id}`);
  const failed = items.filter((i) => i.status === "done" && i.decision === "FAIL");
  const errored = items.filter((i) => i.status === "error");
  const pct = summary.total ? (summary.done / summary.total) * 100 : 0;

  return (
    <>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />

      {phase === "idle" && !staged && <Picker onPick={pick} />}

      {phase === "idle" && staged && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to inspect {plural(staged.images.length, "image")}</CardTitle>
            <CardDescription>{staged.skipped > 0 ? `${plural(staged.skipped, "non-image file")} will be skipped. ` : ""}Choose how to inspect them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Scan type</div>
                <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                  <SelectTrigger aria-label="Detection method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {labelOf(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Profile</div>
                <ProfileSelector className="w-full sm:w-full" />
              </div>
            </div>
            {staged.images.length > 100 && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                The server takes 100 images at a time, so this runs as {Math.ceil(staged.images.length / 100)} consecutive batches.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={begin}>
                <Play />
                Inspect {plural(staged.images.length, "image")}
              </Button>
              <Button variant="ghost" onClick={() => setStaged(null)}>
                Choose different images
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase !== "idle" && (
        <div className="space-y-5">
          <Card className="gap-3 py-4">
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <div className="num text-sm" role="status" aria-live="polite">
                  <span className="text-lg font-semibold">{summary.done}</span>
                  <span className="text-muted-foreground"> / {summary.total} done</span>
                </div>
                <div className="num flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5 text-success"><CircleCheck className="size-4" />{summary.passed} pass</span>
                  <span className="flex items-center gap-1.5 text-destructive"><CircleX className="size-4" />{summary.failed} fail</span>
                  {summary.errors > 0 && <span className="flex items-center gap-1.5 text-warning"><TriangleAlert className="size-4" />{summary.errors} error</span>}
                  <span className="text-muted-foreground">{formatDuration(elapsed)}</span>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.done} aria-label="Batch progress">
                <motion.div className="h-full bg-primary" animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {items.map((it) => (
              <BatchTile key={it.key} item={it} preview={batch.preview(it.key)} onOpen={open} />
            ))}
          </div>

          <AnimatePresence>
            {phase === "complete" && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 200, damping: 24 }}>
                <Card className="border-primary/30">
                  <CardHeader>
                    <CardTitle>Summary</CardTitle>
                    <CardDescription>
                      Finished in {formatDuration(batch.finishedAt - batch.startedAt)}
                      {summary.total > 0 && ` · about ${formatDuration((batch.finishedAt - batch.startedAt) / summary.total)} per image`}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <dl className="num grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {[
                        ["Inspected", summary.passed + summary.failed, ""],
                        ["Pass rate", summary.passRate === null ? "—" : `${(summary.passRate * 100).toFixed(1)}%`, summary.passRate !== null && summary.passRate < 0.7 ? "text-destructive" : "text-success"],
                        ["Failed", summary.failed, summary.failed ? "text-destructive" : ""],
                        ["Errors", summary.errors, summary.errors ? "text-warning" : ""],
                      ].map(([label, value, tone]) => (
                        <div key={label as string}>
                          <dt className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
                          <dd className={cn("mt-1 text-2xl font-semibold", tone as string)}>{value}</dd>
                        </div>
                      ))}
                    </dl>

                    {failed.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-medium text-muted-foreground">Failed images (click to open)</div>
                        <ul className="flex flex-wrap gap-2">
                          {failed.slice(0, 12).map((f) => (
                            <li key={f.key}>
                              <Button variant="outline" size="sm" onClick={() => f.inspectionId !== undefined && open(f.inspectionId)} className="max-w-56">
                                <span className="truncate">{f.key.split("/").pop()}</span>
                                <span className="num text-muted-foreground">{f.defectCount}</span>
                              </Button>
                            </li>
                          ))}
                          {failed.length > 12 && <li className="self-center text-xs text-muted-foreground">+{failed.length - 12} more</li>}
                        </ul>
                      </div>
                    )}
                    {errored.length > 0 && (
                      <ul className="space-y-1 text-xs text-warning">
                        {errored.slice(0, 5).map((e) => (
                          <li key={e.key} className="flex gap-2"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /><span className="truncate">{e.key}: {e.error}</span></li>
                        ))}
                      </ul>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void exportCsv()} disabled={exporting}>
                        <Download />
                        {exporting ? "Preparing…" : "Export CSV"}
                      </Button>
                      <ReportButton targets={batch.batchIds.map((id) => ({ kind: "batch", id }))} label={batch.batchIds.length > 1 ? `Download reports (${batch.batchIds.length})` : "Download report"} />
                      {batch.batchIds.length === 1 && (
                        <Button variant="outline" onClick={() => navigate(`/history?batch=${batch.batchIds[0]}`)}>
                          View in History
                        </Button>
                      )}
                      <Button variant="ghost" onClick={batch.reset}>
                        <RotateCcw />
                        New batch
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
