import { useMutation } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchReport, saveBlob, type ReportTarget } from "@/lib/report";

interface ReportButtonProps {
  /** One PDF per target (a batch run that was split into several uploads has several). */
  targets: ReportTarget[];
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
  className?: string;
}

/** Downloads PDF report(s). Failures go through the global toast handler. */
export function ReportButton({ targets, label = "Download report", variant = "outline", size, disabled, className }: ReportButtonProps) {
  const download = useMutation({
    mutationFn: async () => {
      for (const target of targets) {
        const { blob, filename } = await fetchReport(target);
        saveBlob(filename, blob);
      }
      return targets.length;
    },
    onSuccess: (count) => toast.success(count === 1 ? "Report downloaded" : `${count} reports downloaded`),
  });
  return (
    <Button variant={variant} size={size} className={className} disabled={disabled || targets.length === 0 || download.isPending} onClick={() => download.mutate()}>
      {download.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
      {download.isPending ? "Preparing report…" : label}
    </Button>
  );
}
