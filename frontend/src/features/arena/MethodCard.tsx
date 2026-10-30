import { motion } from "framer-motion";
import { CircleCheck, CircleX, Info, TriangleAlert, Trophy, Zap } from "lucide-react";
import { METHOD_LABELS, type ArenaMethodResult, type Method } from "@/api/types";
import { DecisionBadge } from "@/components/DecisionBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, plural } from "@/lib/utils";
import { useDiffMap } from "./diffMap";
import type { Truth } from "./winner";

export type ViewMode = "overlay" | "mask" | "error";

type MetricKey = "iou" | "dice" | "precision" | "recall";

const METRICS: { key: MetricKey; label: string; title: string }[] = [
  { key: "iou", label: "IoU", title: "Overlap of the predicted and true defect pixels: |A∩B| / |A∪B|." },
  { key: "dice", label: "Dice = F1", title: "2|A∩B| / (|A|+|B|). At pixel level the F1 score is exactly the Dice coefficient." },
  { key: "precision", label: "Precision", title: "Of the pixels flagged, how many really are defect. Missing when nothing was flagged." },
  { key: "recall", label: "Recall", title: "Of the true defect pixels, how many were flagged. Missing when the truth is empty." },
];

function MetricBar({ label, title, value, best }: { label: string; title: string; value: number | null | undefined; best: number | null }) {
  const behind = value != null && best != null && best - value > 0.005 ? best - value : 0;
  return (
    <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2.5 text-xs" title={title}>
      <span className="text-muted-foreground">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(value ?? 0) * 100}%` }} transition={{ duration: 0.5 }} />
      </div>
      <span className="num flex w-[4.5rem] items-baseline justify-end gap-1.5">
        <span className={cn("font-semibold", value == null && "text-muted-foreground")}>{value == null ? "—" : value.toFixed(3)}</span>
        {behind > 0 && <span className="text-[10px] text-muted-foreground">−{behind.toFixed(2)}</span>}
      </span>
    </div>
  );
}

interface MethodCardProps {
  result: ArenaMethodResult | undefined;
  method: Method;
  winner: boolean;
  fastest: boolean;
  truth: Truth;
  mode: ViewMode;
  gtUrl: string | null;
  /** the image under test, shown dimmed behind the error map for context */
  imageUrl: string | null;
  best: Record<MetricKey, number | null>;
  /** shown while the first run is in flight */
  loading: boolean;
}

export function MethodCard({ result, method, winner, fastest, truth, mode, gtUrl, imageUrl, best, loading }: MethodCardProps) {
  const ok = result?.status === "ok";
  const diff = useDiffMap(mode === "error" && ok ? result?.mask : null, mode === "error" ? gtUrl : null);
  const src = !ok ? null : mode === "overlay" ? result?.overlay : mode === "mask" ? result?.mask : (diff?.src ?? null);
  const hasTruth = truth !== "none";

  return (
    <motion.div layout transition={{ type: "spring", stiffness: 260, damping: 28 }}>
      <Card className={cn("gap-3 overflow-hidden py-0 transition-shadow", winner && "border-primary/60 shadow-[0_0_32px_-10px_var(--primary)] ring-1 ring-primary/40")}>
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <h3 className="text-sm font-semibold">{METHOD_LABELS[method]}</h3>
          <div className="flex gap-1.5">
            {winner && <Badge variant="default" className="gap-1"><Trophy />Winner</Badge>}
            {fastest && ok && <Badge variant="muted" className="gap-1"><Zap />Fastest</Badge>}
          </div>
        </div>

        <div className="relative mx-4 aspect-square overflow-hidden rounded-lg border bg-black/40">
          {loading || (ok && mode === "error" && !diff && gtUrl) ? (
            <Skeleton className="size-full rounded-none" />
          ) : src ? (
            <>
              {mode === "error" && imageUrl && <img src={imageUrl} alt="" aria-hidden className="absolute inset-0 size-full object-contain opacity-35 grayscale" />}
              <img src={src} alt={`${METHOD_LABELS[method]} result`} className="relative size-full object-contain" />
            </>
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-5 text-center">
              {result?.status === "error" ? <TriangleAlert className="size-6 text-destructive" /> : <Info className="size-6 text-muted-foreground" />}
              <p className="text-xs leading-snug text-muted-foreground">
                {result?.status === "skipped"
                  ? `${result.message ?? "Skipped"}. Add a reference image above to include this method.`
                  : result?.message ?? (mode === "error" && !gtUrl ? "Add a ground-truth mask to see the error map." : "No result.")}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2.5 px-4">
          {ok && hasTruth && result.iou != null ? (
            METRICS.map((m) => <MetricBar key={m.key} label={m.label} title={m.title} value={result[m.key]} best={best[m.key]} />)
          ) : (
            ok && <p className="rounded-md bg-muted/50 px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">Add a ground-truth mask to score this result with IoU, Dice, precision and recall.</p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t bg-muted/20 px-4 py-3 text-xs">
          {ok && result.decision ? (
            <>
              <DecisionBadge decision={result.decision} />
              {truth !== "none" && (
                <span className={cn("flex items-center gap-1", result.correct ? "text-success" : "text-destructive")} title="Does the PASS / FAIL verdict match the ground truth?">
                  {result.correct ? <CircleCheck className="size-3.5" /> : <CircleX className="size-3.5" />}
                  {result.correct ? "right call" : "wrong call"}
                </span>
              )}
              <span className="num text-muted-foreground">{plural(result.defects.length, "region")} · {result.defect_area_percent?.toFixed(2)}%</span>
              <span className="num ml-auto">{result.total_ms != null ? `${Math.round(result.total_ms)} ms` : "—"}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{loading ? "Running…" : "—"}</span>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
