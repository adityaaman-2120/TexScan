import { Check, ExternalLink, ScanSearch, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fileUrl } from "@/api/client";
import { useDeleteInspection, useInspection } from "@/api/hooks";
import { METHOD_LABELS, type Method } from "@/api/types";
import { DecisionBadge } from "@/components/DecisionBadge";
import { ReportButton } from "@/components/ReportButton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TimingChart } from "@/features/inspect/Charts";
import { DefectTable } from "@/features/inspect/DefectTable";
import { stageInfo } from "@/features/inspect/stageInfo";
import { XRay } from "@/features/inspect/XRay";
import { cn, plural } from "@/lib/utils";

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="num mt-0.5 truncate text-sm font-semibold">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

interface InspectionDrawerProps {
  id: number | undefined;
  onClose: () => void;
  profileName: (id: number | null) => string;
}

/** Everything about one stored inspection: the stage images, defects, timings and the settings that produced them. */
export function InspectionDrawer({ id, onClose, profileName }: InspectionDrawerProps) {
  const { data: result, isPending, isError } = useInspection(id);
  const remove = useDeleteInspection();
  const [stage, setStage] = useState("overlay");
  const [confirming, setConfirming] = useState(false);
  const [xray, setXray] = useState(false);

  useEffect(() => {
    setStage("overlay");
    setConfirming(false);
  }, [id]);

  const stages = result ? Object.keys(result.stage_urls) : [];
  const active = result && stage in result.stage_urls ? stage : "overlay";
  const cfg = result?.config;

  const doDelete = () => {
    if (id === undefined) return;
    remove.mutate(id, {
      onSuccess: () => {
        toast.success("Inspection deleted");
        onClose();
      },
    });
  };

  return (
    <>
      <Sheet open={id !== undefined} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right">
          <SheetDescription className="sr-only">Full result of one inspection</SheetDescription>
          <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <SheetTitle className="truncate text-base font-semibold">{result?.filename ?? "Inspection"}</SheetTitle>
              <p className="num mt-0.5 text-xs text-muted-foreground">
                #{id} {result && `· ${new Date(result.created_at).toLocaleString()}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {result && <DecisionBadge decision={result.decision} />}
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
                <X />
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {isError && <p className="text-sm text-destructive">This inspection could not be loaded. It may have been deleted.</p>}
            {isPending && !isError && (
              <div className="space-y-4">
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            )}
            {result && (
              <>
                <Section title={stageInfo(active, result.config).title}>
                  <div className="overflow-hidden rounded-lg border bg-black/40">
                    <img src={fileUrl(result.stage_urls[active]!)} alt={stageInfo(active, result.config).title} className="mx-auto max-h-[52vh] w-auto max-w-full object-contain" />
                  </div>
                  <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Pipeline stages">
                    {stages.map((name) => (
                      <li key={name} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => setStage(name)}
                          aria-pressed={name === active}
                          title={stageInfo(name, result.config).title}
                          className={cn(
                            "block w-16 overflow-hidden rounded-md border outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring",
                            name === active ? "border-primary ring-1 ring-primary/50" : "opacity-70 hover:opacity-100",
                          )}
                        >
                          <img src={fileUrl(result.stage_urls[name]!)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Section>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Metric label="Defects" value={result.metrics.defect_count.toLocaleString()} />
                  <Metric label="Defect area" value={`${result.metrics.defect_area_percent.toFixed(result.metrics.defect_area_percent < 1 ? 3 : 2)}%`} />
                  <Metric label="Run time" value={`${Math.round(result.metrics.total_ms)} ms`} />
                  <Metric label="Method" value={METHOD_LABELS[result.method as Method] ?? result.method} />
                  <Metric label="Profile" value={profileName(result.profile_id)} />
                  <Metric label="Working size" value={`${result.metrics.image_width}×${result.metrics.image_height}`} />
                </dl>

                <Section title={`Defects (${plural(result.defects.length, "region")})`}>
                  <DefectTable defects={result.defects} hoveredId={null} selectedId={null} onHover={() => undefined} onSelect={() => undefined} />
                </Section>

                <Section title="Stage timings">
                  <TimingChart timings={result.timings_ms} />
                </Section>

                {cfg && (
                  <Section title="Settings used">
                    <dl className="num grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {[
                        ["method", cfg.method],
                        ["max side", `${cfg.max_side} px`],
                        ["denoise", `${cfg.denoise.method} ${cfg.denoise.ksize}`],
                        ["enhance", cfg.enhance.method],
                        ["threshold", cfg.method === "gabor" ? `k ${cfg.gabor.k}` : cfg.method === "local_statistics" ? `k ${cfg.local_stats.k}` : `${cfg.threshold.min_threshold}`],
                        ["min area", `${cfg.morphology.min_area} px`],
                        ["cleanup kernel", `${cfg.morphology.kernel_size}`],
                        ["fail when", `> ${cfg.max_defects} defects`],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </Section>
                )}
              </>
            )}
          </div>

          {result && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-3">
              <Button variant="outline" onClick={() => setXray(true)} className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary">
                <ScanSearch />
                Pipeline X-Ray
              </Button>
              <ReportButton targets={[{ kind: "inspection", id: result.id }]} />
              <Button variant="ghost" asChild>
                <a href={fileUrl(result.stage_urls.upload!)} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Original
                </a>
              </Button>
              <div className="ml-auto flex items-center gap-2">
                {confirming ? (
                  <>
                    <span className="text-xs text-muted-foreground">Delete this inspection?</span>
                    <Button variant="destructive" size="sm" onClick={doDelete} disabled={remove.isPending}>
                      <Check />
                      Delete
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirming(true)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {result && <XRay result={result} open={xray} onOpenChange={setXray} />}
    </>
  );
}
