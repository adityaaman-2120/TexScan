import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "pass" | "fail" | "warn" | "accent";

const toneClass: Record<Tone, string> = {
  neutral: "text-foreground",
  accent: "text-primary",
  pass: "text-success",
  fail: "text-destructive",
  warn: "text-warning",
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
  loading?: boolean;
  icon?: React.ReactNode;
}

/** A lab-instrument style readout: small caption, large monospace value. */
export function StatCard({ label, value, hint, tone = "neutral", loading, icon }: StatCardProps) {
  return (
    <Card className="gap-3 py-4">
      <div className="flex items-center justify-between px-5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="px-5">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className={cn("num text-3xl font-semibold leading-none", toneClass[tone])}>{value}</div>
        )}
        {hint && (loading ? <Skeleton className="mt-3 h-3 w-32" /> : <p className="mt-2 text-xs text-muted-foreground">{hint}</p>)}
      </div>
    </Card>
  );
}
