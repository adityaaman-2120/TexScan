import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/motion";
import { cn } from "@/lib/utils";
import { SAMPLES, type SampleImage } from "./samples";

interface SampleGalleryProps {
  onPick: (sample: SampleImage) => void;
  /** "grid": large cards with descriptions; "mini": small thumbnails for the side panel */
  variant?: "grid" | "mini";
  activeId?: string;
}

export function SampleGallery({ onPick, variant = "grid", activeId }: SampleGalleryProps) {
  if (variant === "mini") {
    return (
      <div className="grid grid-cols-4 gap-2">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            title={`${s.title}: ${s.description}`}
            aria-label={`Try sample: ${s.title}`}
            onClick={() => onPick(s)}
            className={cn(
              "overflow-hidden rounded-md border outline-none transition-all hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring",
              activeId === s.id && "border-primary ring-1 ring-primary/40",
            )}
          >
            <img src={s.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {SAMPLES.map((s) => (
        <StaggerItem key={s.id}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className="group flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-left outline-none transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            <div className="relative overflow-hidden">
              <img src={s.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <Badge variant="muted" className="absolute left-2 top-2 bg-background/80 backdrop-blur">
                synthetic
              </Badge>
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <span className="text-sm font-medium">{s.title}</span>
              <span className="text-xs leading-snug text-muted-foreground">{s.description}</span>
            </div>
          </button>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
