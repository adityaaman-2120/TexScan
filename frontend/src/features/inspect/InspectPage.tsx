import { Eye, Frame, Layers, Layout, Layers2, Thermometer, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { requireNav } from "@/app/nav";
import { useUi } from "@/store/ui";
import { hotkeyFor } from "@/lib/hotkeys";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented, type SegmentOption } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { CompareSlider } from "./CompareSlider";
import { ControlPanel } from "./ControlPanel";
import { DefectTable } from "./DefectTable";
import { ProductDefects } from "./ProductDefects";
import { Dropzone } from "./Dropzone";
import { HistogramChart, TimingChart } from "./Charts";
import { heatKey, residualKey } from "./stageInfo";
import { useInspectSession } from "./useInspectSession";
import { VerdictHeader } from "./VerdictHeader";
import { Viewer, type FocusRequest, type OverlayMode } from "./Viewer";
import { XRay } from "./XRay";

const item = requireNav("/inspect");

const RESIDUAL_LABELS: Record<string, string> = {
  residual: "Residual",
  difference: "Difference",
  anomaly_score: "Anomaly score",
  residual_abs: "Deviation",
  local_variance: "Local variance",
};

export function InspectPage() {
  const session = useInspectSession();
  const { result, running } = session;
  const profileId = useUi((s) => s.profileId);
  const engineering = useUi((s) => s.engineering);

  const [mode, setMode] = useState<OverlayMode>("boxes");
  const [opacity, setOpacity] = useState(0.85);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [xray, setXray] = useState(false);

  // paste an image from the clipboard anywhere on the page
  const { acceptFile } = session;
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

  // U opens the file picker, X opens the pipeline X-Ray (never while typing or with a menu / dialog open)
  const picker = useRef<HTMLInputElement>(null);
  const canXray = Boolean(result) && engineering;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const hotkey = hotkeyFor(e);
      if (hotkey === "upload") {
        e.preventDefault();
        picker.current?.click();
      } else if (hotkey === "xray" && canXray) {
        e.preventDefault();
        setXray(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canXray]);

  // selection belongs to one result
  const resultId = result?.id;
  useEffect(() => {
    setHovered(null);
    setSelected(null);
  }, [resultId]);

  const urls = result?.stage_urls ?? {};
  const resKey = residualKey(urls);
  const hasHeat = Boolean(heatKey(urls));
  const overlayOptions: SegmentOption<OverlayMode>[] = engineering
    ? [
        { value: "none", label: "Off", icon: Eye },
        { value: "boxes", label: "Boxes", icon: Frame },
        { value: "mask", label: "Mask", icon: Layers },
        { value: "edges", label: "Edges", icon: Layout },
        { value: "heatmap", label: "Heatmap", icon: Thermometer, disabled: !hasHeat },
      ]
    : [
        { value: "none", label: "Off", icon: Eye },
        { value: "boxes", label: "Boxes", icon: Frame },
        { value: "mask", label: "Highlight", icon: Layers2 },
      ];

  // the operator view has no edges / heatmap layers
  useEffect(() => {
    if (!engineering && (mode === "edges" || mode === "heatmap")) setMode("boxes");
  }, [engineering, mode]);

  const selectDefect = (id: number) => {
    setSelected(id);
    setFocus({ id, nonce: Date.now() });
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        session.acceptFile(e.dataTransfer.files[0]);
      }}
    >
      <PageHeader
        icon={item.icon}
        title={item.label}
        description={item.description}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/batch">
              <Layers />
              Check many photos
            </Link>
          </Button>
        }
      />
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose an image (shortcut: U)"
        onChange={(e) => {
          session.acceptFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <ControlPanel session={session} />
        </aside>

        <div className="order-1 min-w-0 space-y-5 lg:order-2">
          {!session.file ? (
            <Dropzone onFile={session.acceptFile} />
          ) : (
            <Stagger className="space-y-5" key={session.file.name + session.file.size}>
              <StaggerItem>
                <Card className="py-5">
                  <CardContent>
                    <VerdictHeader result={result} running={running} onXRay={() => setXray(true)} engineering={engineering} />
                    {result?.decision === "FAIL" && profileId === null && (
                      <p role="note" className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                        <span>
                          {engineering ? "These are untuned settings. On a real photo (uneven light, folds, the edge of the cloth) they can call good cloth defective." : "No fabric profile is selected. Uneven light, folds or the edge of the cloth can make good fabric look defective."} For a trustworthy verdict make a <Link to="/profiles" className="text-primary underline-offset-4 hover:underline">profile</Link> from 5 to 20 good images of the same fabric and select it.
                        </span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              </StaggerItem>

              <StaggerItem>
                <Card className="gap-4">
                  <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Defect overlay</CardTitle>
                    <div className="flex flex-wrap items-center gap-3">
                      <Segmented value={mode} onChange={setMode} options={overlayOptions} label="Overlay type" />
                      {engineering && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          Opacity
                          <Slider value={[opacity * 100]} min={10} max={100} step={5} onValueChange={([v]) => setOpacity(v! / 100)} className="w-24" aria-label="Overlay opacity" />
                          <span className="num w-8 text-foreground">{Math.round(opacity * 100)}%</span>
                        </label>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {result ? (
                      <Viewer
                        result={result}
                        mode={mode}
                        opacity={opacity}
                        hoveredId={hovered}
                        selectedId={selected}
                        onHover={setHovered}
                        onSelect={(id) => (id === null ? setSelected(null) : selectDefect(id))}
                        focusRequest={focus}
                        busy={running}
                      />
                    ) : (
                      <Skeleton className="h-[min(62vh,620px)] min-h-[320px] w-full" />
                    )}
                  </CardContent>
                </Card>
              </StaggerItem>

              <StaggerItem className={engineering ? "grid items-start gap-5 xl:grid-cols-2" : "grid items-start gap-5"}>
                {engineering && (
                <Card className="gap-4">
                  <CardHeader>
                    <CardTitle>Before / after</CardTitle>
                    <CardDescription>Drag the handle to wipe between your image and what the method sees.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result && resKey ? (
                      <CompareSlider
                        beforeUrl={urls.original!}
                        afterUrl={urls[resKey]!}
                        beforeLabel="Original"
                        afterLabel={RESIDUAL_LABELS[resKey] ?? resKey}
                        width={result.metrics.image_width}
                        height={result.metrics.image_height}
                      />
                    ) : (
                      <Skeleton className="aspect-square w-full" />
                    )}
                  </CardContent>
                </Card>
                )}

                <Card className="gap-4">
                  <CardHeader>
                    <CardTitle>{engineering ? "Defects" : "What was found"}</CardTitle>
                    <CardDescription>Click a row to zoom to it. Hover to highlight it on the image.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result && engineering ? (
                      <DefectTable defects={result.defects} hoveredId={hovered} selectedId={selected} onHover={setHovered} onSelect={selectDefect} calibrated={result.config.calibration != null} profileId={result.profile_id} />
                    ) : result ? (
                      <ProductDefects
                        defects={result.defects}
                        width={result.metrics.image_width}
                        height={result.metrics.image_height}
                        hoveredId={hovered}
                        selectedId={selected}
                        onHover={setHovered}
                        onSelect={selectDefect}
                        calibrated={result.config.calibration != null}
                        profileId={result.profile_id}
                      />
                    ) : (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }, (_, i) => (
                          <Skeleton key={i} className="h-9" />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </StaggerItem>

              {engineering && (
              <StaggerItem className="grid items-start gap-5 xl:grid-cols-2">
                <Card className="gap-4">
                  <CardHeader>
                    <CardTitle>Histogram</CardTitle>
                    <CardDescription>Gray levels before and after contrast enhancement.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result ? (
                      <HistogramChart before={result.histograms.before!} after={result.histograms.after!} enhanceMethod={result.config.enhance.method} />
                    ) : (
                      <Skeleton className="h-52 w-full" />
                    )}
                  </CardContent>
                </Card>
                <Card className="gap-4">
                  <CardHeader>
                    <CardTitle>Stage timings</CardTitle>
                    <CardDescription>Where the milliseconds went.</CardDescription>
                  </CardHeader>
                  <CardContent>{result ? <TimingChart timings={result.timings_ms} /> : <Skeleton className="h-52 w-full" />}</CardContent>
                </Card>
              </StaggerItem>
              )}
            </Stagger>
          )}
        </div>
      </div>

      {result && engineering && <XRay result={result} open={xray} onOpenChange={setXray} />}
    </div>
  );
}
