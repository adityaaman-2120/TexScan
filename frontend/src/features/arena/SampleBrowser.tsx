import { Database } from "lucide-react";
import { useEffect, useState } from "react";
import { fileUrl } from "@/api/client";
import { useMvtecSamples, useMvtecStatus } from "@/api/hooks";
import type { MvtecSample } from "@/api/types";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SampleBrowserProps {
  onMvtec: (sample: MvtecSample) => void;
  activeLabel: string | null;
}

function MvtecPanel({ onPick, activeLabel }: { onPick: (s: MvtecSample) => void; activeLabel: string | null }) {
  const { data: status, isPending } = useMvtecStatus();
  const [category, setCategory] = useState<string>();
  useEffect(() => {
    if (status?.available && !category) setCategory(status.categories[0]?.name);
  }, [status, category]);
  const { data: samples, isPending: loadingSamples } = useMvtecSamples(status?.available ? category : undefined);

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!status?.available) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed p-5 text-sm">
        <div className="flex items-center gap-2 font-medium"><Database className="size-4 text-muted-foreground" />MVTec AD is not set up on the server</div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Download MVTec AD, extract it, and start the backend with <code className="num rounded bg-muted px-1.5 py-0.5 text-xs">MVTEC_PATH</code> pointing at the folder that contains
          <span className="num"> carpet/, grid/, leather/, tile/, wood/</span>. Its samples, with their ground-truth masks, will then appear here. The README has the download steps.
        </p>
        {status?.message && <p className="num text-[11px] text-muted-foreground">{status.message}</p>}
      </div>
    );
  }
  const current = status.categories.find((c) => c.name === category);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44" aria-label="MVTec category"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>{status.categories.map((c) => <SelectItem key={c.name} value={c.name} hint={`${c.test_images}`}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        {current && <span className="num text-xs text-muted-foreground">{Object.entries(current.defect_types).map(([k, v]) => `${k} ${v}`).join(" · ")}</span>}
      </div>
      {loadingSamples ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}</div>
      ) : (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8" aria-label="MVTec samples">
          {samples?.map((s) => {
            const label = `${s.category} / ${s.defect_type} / ${s.name}`;
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  title={`${s.defect_type} · ${s.name}`}
                  aria-label={`Use ${label}`}
                  className={cn("relative block w-full overflow-hidden rounded-md border outline-none transition-all hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring", activeLabel === label && "border-primary ring-1 ring-primary/50")}
                >
                  <img src={fileUrl(`/datasets/mvtec/files/${s.category}/${s.defect_type}/${s.name}`)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 py-0.5 text-[10px]">{s.defect_type}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Defective test images with ground-truth masks. The first good training image of the category is used as the golden-template reference.</p>
    </div>
  );
}

export function SampleBrowser({ onMvtec, activeLabel }: SampleBrowserProps) {
  return (
    <Card className="gap-4 p-4 py-4">
      <div>
        <div className="text-sm font-medium">MVTec AD samples</div>
        <div className="text-xs text-muted-foreground">Each comes with its ground-truth mask.</div>
      </div>
      <MvtecPanel onPick={onMvtec} activeLabel={activeLabel} />
    </Card>
  );
}
