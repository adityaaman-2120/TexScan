import { Brush, Eraser, FlipHorizontal2, MousePointerClick, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { requireNav } from "@/app/nav";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented, type SegmentOption } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Dropzone } from "@/features/inspect/Dropzone";
import { cn } from "@/lib/utils";
import { ControlsPanel } from "./ControlsPanel";
import { InfoPanel } from "./InfoPanel";
import { ResultPanels } from "./ResultPanels";
import { SpectrumCanvas } from "./SpectrumCanvas";
import { useSpectrumStudio, type Tool } from "./useSpectrumStudio";

const item = requireNav("/spectrum");

const TOOLS: SegmentOption<Tool>[] = [
  { value: "paint", label: "Paint notch", icon: Brush },
  { value: "erase", label: "Erase", icon: Eraser },
  { value: "select", label: "Peaks", icon: MousePointerClick },
];

export function SpectrumPage() {
  const studio = useSpectrumStudio();
  const { file, spectrum, acceptFile } = studio;

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  // paste an image from the clipboard anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const image = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (image) {
        e.preventDefault();
        acceptFile(image);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptFile]);

  const aspect = spectrum ? `${spectrum.width} / ${spectrum.height}` : "1 / 1";

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files[0]); }}>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />

      {!file ? (
        <div className="space-y-3">
          <Dropzone onFile={acceptFile} />
          <p className="text-xs text-muted-foreground">Periodic textures (weave, plaid) show the clearest peaks. Non-periodic grain, such as leather, has none.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="order-2 lg:order-1 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
            <ControlsPanel studio={studio} />
          </aside>

          <Stagger className="order-1 min-w-0 space-y-5 lg:order-2" key={file.name + file.size}>
            <StaggerItem className="grid items-start gap-5 md:grid-cols-2">
              <Card className="order-2 gap-4 md:order-1">
                <CardHeader>
                  <CardTitle>Image</CardTitle>
                  <CardDescription>What you uploaded.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-lg border bg-black/40" style={{ aspectRatio: aspect }}>
                    {previewUrl && <img src={previewUrl} alt="Uploaded image" className="size-full object-contain" />}
                  </div>
                </CardContent>
              </Card>

              <Card className="order-1 gap-4 md:order-2">
                <CardHeader className="gap-3">
                  <div>
                    <CardTitle>Spectrum</CardTitle>
                    <CardDescription>Log-magnitude of the 2-D FFT, zero frequency in the centre.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Segmented label="Tool" value={studio.tool} onChange={studio.setTool} options={TOOLS} />
                    <label className={cn("flex items-center gap-2 text-xs text-muted-foreground", studio.tool === "select" && "opacity-40")}>
                      Brush
                      <Slider value={[studio.brushRadius]} min={1} max={40} step={1} onValueChange={([v]) => studio.setBrushRadius(v!)} className="w-20" aria-label="Brush radius" disabled={studio.tool === "select"} />
                      <span className="num w-9 text-foreground">{studio.brushRadius}px</span>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-pressed={studio.symmetric}
                      onClick={() => studio.setSymmetric(!studio.symmetric)}
                      title="On: every stroke is mirrored through the centre, as a real image needs. Off: only the painted side is rejected, which has half the effect on a real image."
                      className={cn(studio.symmetric && "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
                    >
                      <FlipHorizontal2 />
                      Symmetric {studio.symmetric ? "on" : "off"}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={!studio.hasPaint} onClick={studio.clearPaint}>
                      <Trash2 />
                      Clear strokes
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {spectrum && studio.paint ? (
                    <SpectrumCanvas
                      spectrumUrl={spectrum.spectrum}
                      width={spectrum.width}
                      height={spectrum.height}
                      pairs={studio.pairs}
                      enabled={studio.enabled}
                      peakRadius={studio.peakRadius}
                      paint={studio.paint}
                      tool={studio.tool}
                      brushRadius={studio.brushRadius}
                      symmetric={studio.symmetric}
                      preset={studio.preset}
                      onPaint={studio.notifyPaint}
                      onTogglePair={studio.togglePair}
                    />
                  ) : (
                    <Skeleton className="w-full" style={{ aspectRatio: aspect }} />
                  )}
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
                    <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-primary" aria-hidden />peak rejected</li>
                    <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-dashed border-muted-foreground" aria-hidden />peak off</li>
                    <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-destructive/60" aria-hidden />rejected area</li>
                    {studio.preset.kind !== "none" && <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#3b82f6]/60" aria-hidden />filtered out</li>}
                  </ul>
                </CardContent>
              </Card>
            </StaggerItem>

            <StaggerItem>
              <InfoPanel presetActive={studio.preset.kind !== "none"} />
            </StaggerItem>

            <StaggerItem>
              <ResultPanels result={studio.result} applying={studio.applying || studio.loadingSpectrum} aspect={aspect} />
            </StaggerItem>
          </Stagger>
        </div>
      )}
    </div>
  );
}
