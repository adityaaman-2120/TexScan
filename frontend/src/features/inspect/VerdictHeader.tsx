import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleX, Loader2, ScanSearch } from "lucide-react";
import { METHOD_LABELS, type InspectionOut, type Method } from "@/api/types";
import { ReportButton } from "@/components/ReportButton";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-base font-semibold leading-tight">{value}</div>
    </div>
  );
}

interface VerdictHeaderProps {
  result: InspectionOut | null;
  running: boolean;
  onXRay: () => void;
  /** Engineering mode: also show run time, method and the X-Ray button. */
  engineering?: boolean;
}

export function VerdictHeader({ result, running, onXRay, engineering = false }: VerdictHeaderProps) {
  if (!result) {
    return (
      <div className="flex items-center gap-5">
        <Skeleton className="h-20 w-44 rounded-xl" />
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    );
  }

  const pass = result.decision === "PASS";
  const m = result.metrics;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={result.decision}
          initial={{ scale: 0.7, opacity: 0, rotate: -3 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
          role="status"
          aria-label={`Decision: ${result.decision}`}
          className={cn(
            "relative flex h-20 w-44 shrink-0 items-center justify-center gap-3 rounded-xl border-2 font-mono text-4xl font-bold tracking-widest",
            pass
              ? "border-success/50 bg-success/10 text-success shadow-[0_0_44px_-10px_var(--success)]"
              : "border-destructive/50 bg-destructive/10 text-destructive shadow-[0_0_44px_-10px_var(--destructive)]",
          )}
        >
          {pass ? <CircleCheck className="size-8" /> : <CircleX className="size-8" />}
          {result.decision}
          {running && <Loader2 className="absolute right-2 top-2 size-4 animate-spin text-muted-foreground" aria-label="Re-running" />}
        </motion.div>
      </AnimatePresence>

      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-[repeat(var(--verdict-cols),minmax(0,1fr))]" style={{ "--verdict-cols": engineering ? 4 : 2 } as React.CSSProperties}>
        <Metric label="Defects" value={m.defect_count.toLocaleString()} />
        <Metric label={engineering ? "Defect area" : "Affected area"} value={`${m.defect_area_percent.toFixed(m.defect_area_percent < 1 ? 3 : 2)}%`} />
        {engineering && <Metric label="Run time" value={`${Math.round(m.total_ms)} ms`} />}
        {engineering && <Metric label="Method" value={METHOD_LABELS[result.method as Method] ?? result.method} />}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
        {engineering && (
          <Button variant="outline" onClick={onXRay} className="border-primary/40 text-primary hover:bg-primary/10 hover:text-primary">
            <ScanSearch />
            Pipeline X-Ray
            <Kbd className="hidden md:inline-flex">X</Kbd>
          </Button>
        )}
        <ReportButton targets={[{ kind: "inspection", id: result.id }]} disabled={running} />
      </div>
    </div>
  );
}
