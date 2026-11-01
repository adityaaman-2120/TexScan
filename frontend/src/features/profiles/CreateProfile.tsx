import { FolderOpen, Images, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAutotune } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fromDataTransfer, fromFileList, type Picked, type PickResult } from "@/features/batch/pickFiles";
import { cn } from "@/lib/utils";

const MIN_IMAGES = 5;
const MAX_IMAGES = 20;

const METHODS = [
  { value: "fft", label: "FFT notch", hint: "periodic weaves and grids" },
  { value: "gabor", label: "Gabor bank", hint: "oriented textures" },
  { value: "local_statistics", label: "Local statistics", hint: "any texture, coarse defects" },
] as const;
const QUANTILES = ["99", "99.5", "99.9"] as const;

type Method = (typeof METHODS)[number]["value"];

export function CreateProfile({ onCreated }: { onCreated: (id: number) => void }) {
  const autotune = useAutotune();
  const [name, setName] = useState("");
  const [method, setMethod] = useState<Method>("gabor");
  const [maxSide, setMaxSide] = useState<"512" | "1024">("512");
  const [centerFraction, setCenterFraction] = useState<"0.6" | "1">("1");
  const [quantile, setQuantile] = useState<(typeof QUANTILES)[number]>("99.5");
  const [images, setImages] = useState<Picked[]>([]);
  const [over, setOver] = useState(false);
  const folder = useRef<HTMLInputElement>(null);
  const many = useRef<HTMLInputElement>(null);

  const previews = useMemo(() => images.map((p) => URL.createObjectURL(p.file)), [images]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (result: PickResult) => {
    if (result.images.length === 0) {
      toast.error("No images found", { description: "Choose PNG, JPEG, BMP, TIFF or WebP files." });
      return;
    }
    const merged = [...images, ...result.images];
    if (merged.length > MAX_IMAGES) toast.warning(`Only the first ${MAX_IMAGES} images are used`, { description: `Auto-tune takes ${MIN_IMAGES} to ${MAX_IMAGES}.` });
    setImages(merged.slice(0, MAX_IMAGES));
  };

  const count = images.length;
  const enough = count >= MIN_IMAGES;
  const nameOk = name.trim().length > 0 && name.trim().length <= 80;
  const busy = autotune.isPending;

  const submit = () =>
    autotune.mutate(
      { name: name.trim(), method, quantile: Number(quantile), maxSide: Number(maxSide), centerFraction: Number(centerFraction), images: images.map((p) => p.file) },
      {
        onSuccess: (profile) => {
          toast.success(`Profile "${profile.name}" saved`, { description: `Threshold ${profile.report.threshold.toFixed(2)} learned from ${profile.report.n_images} images.` });
          setImages([]);
          setName("");
          onCreated(profile.id);
        },
      },
    );

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>New profile</CardTitle>
        <CardDescription>Upload {MIN_IMAGES} to {MAX_IMAGES} images of the same material with no defects. TexScan measures how noisy they are and sets the thresholds so they pass.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="profile-name" className="text-xs font-medium">Name</label>
          <Input id="profile-name" value={name} maxLength={80} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="Denim, Ceramic tile…" />
          <p className="text-[11px] text-muted-foreground">Using an existing name replaces that profile.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="text-xs font-medium">Method</div>
            <Select value={method} onValueChange={(v) => setMethod(v as Method)} disabled={busy}>
              <SelectTrigger aria-label="Method"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value} hint={m.hint}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium">Percentile</div>
            <Select value={quantile} onValueChange={(v) => setQuantile(v as (typeof QUANTILES)[number])} disabled={busy}>
              <SelectTrigger aria-label="Percentile"><SelectValue /></SelectTrigger>
              <SelectContent>{QUANTILES.map((q) => <SelectItem key={q} value={q} hint={q === "99.5" ? "default" : undefined}>{q}th</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-medium">Working size</div>
          <Segmented label="Working size" value={maxSide} onChange={setMaxSide} options={[{ value: "512", label: "512 px (fast)" }, { value: "1024", label: "1024 px" }]} />
          <p className="text-[11px] text-muted-foreground">Inspections with this profile run at the same size, so thresholds stay comparable.</p>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-medium">Inspect area</div>
          <Segmented label="Inspect area" value={centerFraction} onChange={setCenterFraction} options={[{ value: "1", label: "Whole picture" }, { value: "0.6", label: "Middle 60%" }]} />
          <p className="text-[11px] text-muted-foreground">Choose Middle 60% when your photos show the edge of the cloth or a table: edges are not defects, and they make the tuned thresholds too lax.</p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) void fromDataTransfer(e.dataTransfer).then(add); }}
          className={cn("rounded-xl border-2 border-dashed p-4 transition-colors", over ? "border-primary bg-primary/10" : "border-border")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Good samples</div>
              <div className={cn("num text-xs", enough ? "text-success" : "text-muted-foreground")}>{count} of {MIN_IMAGES}–{MAX_IMAGES} images{!enough && count > 0 ? ` · ${MIN_IMAGES - count} more needed` : ""}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => many.current?.click()}><Images />Images</Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => folder.current?.click()}><FolderOpen />Folder</Button>
            </div>
          </div>
          {count === 0 ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">Drop images or a folder here</p>
          ) : (
            <ul className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-6" aria-label="Selected good samples">
              {images.map((p, i) => (
                <li key={`${p.path}-${i}`} className="group relative">
                  <img src={previews[i]} alt={p.path} className="aspect-square w-full rounded-md border object-cover" />
                  {!busy && (
                    <button type="button" aria-label={`Remove ${p.path}`} onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow hover:text-destructive group-hover:flex focus-visible:flex">
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <input ref={many} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => { add(fromFileList(e.target.files ?? [])); e.target.value = ""; }} />
          <input ref={folder} type="file" className="sr-only" tabIndex={-1} {...({ webkitdirectory: "", directory: "" } as object)} onChange={(e) => { add(fromFileList(e.target.files ?? [])); e.target.value = ""; }} />
        </div>

        {busy ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin text-primary" />Learning from {count} images…</div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-muted"><div className="absolute inset-y-0 w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full bg-primary" /></div>
            <p className="text-[11px] text-muted-foreground">Each image is processed several times to find the right threshold, so this can take from a few seconds to about a minute.</p>
          </div>
        ) : (
          <Button className="w-full" disabled={!nameOk || !enough} onClick={submit}>
            <Sparkles />
            Learn threshold
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
