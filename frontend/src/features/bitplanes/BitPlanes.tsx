import { useState } from "react";
import { useBitPlanes } from "@/api/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The eight bit planes of the grayscale image. Plane k is bit k of every pixel: P_k = ((I >> k) & 1) * 255. */
export function BitPlanes({ inspectionId }: { inspectionId: number | undefined }) {
  const { data, isPending, isError } = useBitPlanes(inspectionId);
  const [bit, setBit] = useState(7);

  if (inspectionId === undefined) {
    return <p className="text-[11px] leading-snug text-muted-foreground">Run an inspection and its eight bit planes show up here.</p>;
  }
  if (isError) return <p className="text-xs text-warning">Could not load the bit planes.</p>;
  if (isPending || !data) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading bit planes">
        <Skeleton className="aspect-square w-full" />
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      </div>
    );
  }

  const selected = data.planes.find((p) => p.bit === bit) ?? data.planes[0]!;
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border bg-black">
        <img src={selected.image} alt={`${selected.label} of the grayscale image`} width={data.width} height={data.height} className="aspect-square w-full object-contain [image-rendering:pixelated]" />
      </div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{selected.label}</span>
        <span className="num text-muted-foreground">{selected.ones_percent.toFixed(1)}% of pixels set</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Bit plane">
        {data.planes.map((p) => (
          <button
            key={p.bit}
            type="button"
            role="radio"
            aria-checked={p.bit === bit}
            aria-label={p.label}
            onClick={() => setBit(p.bit)}
            className={cn(
              "relative overflow-hidden rounded border bg-black outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
              p.bit === bit ? "border-primary ring-1 ring-primary" : "border-border opacity-80 hover:opacity-100",
            )}
          >
            <img src={p.image} alt="" className="aspect-square w-full object-cover [image-rendering:pixelated]" />
            <span className="num absolute left-0.5 top-0.5 rounded bg-background/80 px-1 text-[10px] leading-4">{p.bit}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Bit 7 carries the structure; the lower planes look like noise. Adding the planes back, weighted by 2<sup>k</sup>, rebuilds the grayscale image.
      </p>
    </div>
  );
}
