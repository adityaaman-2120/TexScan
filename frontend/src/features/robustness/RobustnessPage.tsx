import { FlaskConical } from "lucide-react";
import { useMemo } from "react";
import { METHOD_LABELS, type Method } from "@/api/types";
import { requireNav } from "@/app/nav";
import { EmptyState } from "@/components/EmptyState";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dropzone } from "@/features/inspect/Dropzone";
import { cn } from "@/lib/utils";
import { DegradationChart, QualityCharts } from "./DegradationCharts";
import { decisionRanges, describeRanges, DEGRADATIONS, DEGRADATION_ORDER, formatBytes, formatLevel } from "./levels";
import { ThumbStrip } from "./ThumbStrip";
import { useRobustness, type SweepMethod, type SweepSize } from "./useRobustness";

const item = requireNav("/robustness");
const METHODS: SweepMethod[] = ["fft", "gabor", "local_statistics"]; // golden_template needs a reference

export function RobustnessPage() {
  const lab = useRobustness();
  const { result, resultKind, running } = lab;
  const points = result?.series[resultKind] ?? [];
  const ranges = useMemo(() => decisionRanges(points), [points]);
  const jpeg = resultKind === "jpeg_quality";
  const sortedPoints = useMemo(() => [...points].sort((a, b) => a.level - b.level), [points]);

  return (
    <>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="order-2 space-y-4 lg:order-1 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <Card className="gap-3 p-3 py-3">
            <Dropzone compact={Boolean(lab.image)} onFile={lab.acceptFile} />
          </Card>

          <Card className="gap-4 px-4 py-4">
            <div className="space-y-1.5">
              <div className="text-xs font-medium">Degradation</div>
              <Segmented label="Degradation" value={lab.kind} onChange={lab.setKind} options={DEGRADATION_ORDER.map((k) => ({ value: k, label: DEGRADATIONS[k].label }))} />
              <p className="text-[11.5px] leading-snug text-muted-foreground">{DEGRADATIONS[lab.kind].help}</p>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium">Levels</div>
              <Segmented label="Number of levels" value={String(lab.steps)} onChange={(v) => lab.setSteps(Number(v))} options={[{ value: "5", label: "5" }, { value: "7", label: "7" }, { value: "9", label: "9" }]} />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium">Method</div>
              <Select value={lab.method} onValueChange={(v) => lab.setMethod(v as SweepMethod)}>
                <SelectTrigger aria-label="Detection method"><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{METHOD_LABELS[m as Method]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {lab.profileId === null ? (
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Working size</div>
                <Segmented label="Working size" value={String(lab.size)} onChange={(v) => lab.setSize(Number(v) as SweepSize)} options={[{ value: "512", label: "512 px" }, { value: "1024", label: "1024 px" }]} />
              </div>
            ) : (
              <p className="text-[11.5px] leading-snug text-muted-foreground">Using the active profile's thresholds and working size, so this measures how robust that profile is.</p>
            )}
          </Card>
        </aside>

        <div className="order-1 min-w-0 lg:order-2">
          {!lab.image ? (
            <Card><EmptyState illustration="lab" title="Choose an image to stress-test" description="Upload an image. TexScan degrades it step by step (noise, blur, exposure or JPEG compression) and shows where the verdict breaks down. Try a clean image with noise: a good image can start failing." /></Card>
          ) : (
            <Stagger className="space-y-5" key={lab.image.name + lab.image.size}>
              <StaggerItem>
                <Card className="relative gap-4 overflow-hidden">
                  {running && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary" aria-hidden />}
                  <CardHeader className="gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Verdict and defect area vs {DEGRADATIONS[resultKind].label.toLowerCase()}</CardTitle>
                      {result && <Badge variant="outline">{METHOD_LABELS[result.method as Method] ?? result.method}</Badge>}
                    </div>
                    <CardDescription aria-live="polite">
                      {result ? describeRanges(resultKind, ranges) : running ? "Running the pipeline at every level…" : "Waiting for the sweep."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>{result ? <DegradationChart kind={resultKind} points={points} /> : <Skeleton className="h-64 w-full" />}</CardContent>
                </Card>
              </StaggerItem>

              <StaggerItem>
                <Card className="gap-3">
                  <CardHeader>
                    <CardTitle>Degraded images</CardTitle>
                    <CardDescription>The actual pictures the pipeline saw, from mild to severe, with their verdicts.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result ? <ThumbStrip kind={resultKind} original={result.original_thumbnail} points={points} /> : <div className="flex gap-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="size-28 shrink-0" />)}</div>}
                  </CardContent>
                </Card>
              </StaggerItem>

              <StaggerItem>
                <Card className="gap-4">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FlaskConical className="size-4 text-primary" />
                      <CardTitle>{jpeg ? "Compression experiment" : "How much the image changed"}</CardTitle>
                    </div>
                    <CardDescription>
                      {jpeg
                        ? "File size against quality, with PSNR and SSIM measuring how much picture is lost. Lower quality saves space but costs fidelity, and eventually the verdict."
                        : "PSNR and SSIM compare each degraded image with the original, so you can relate the verdict to how visible the damage is."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {result ? <QualityCharts kind={resultKind} points={points} rawBytes={result.raw_bytes} /> : <Skeleton className="h-40 w-full" />}
                    {result && jpeg && (
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[480px] text-[13px]">
                          <thead>
                            <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                              {["Quality", "File size", "Compression", "PSNR", "SSIM", "Verdict"].map((h, i) => <th key={h} scope="col" className={cn("px-3 py-2 font-medium", i > 0 && i < 5 && "text-right")}>{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {[...sortedPoints].reverse().map((p) => (
                              <tr key={p.level} className="border-b border-border/50 last:border-0">
                                <td className="num px-3 py-2">{formatLevel("jpeg_quality", p.level)}</td>
                                <td className="num px-3 py-2 text-right">{p.file_bytes == null ? "—" : formatBytes(p.file_bytes)}</td>
                                <td className="num px-3 py-2 text-right">{p.file_bytes ? `${(result.raw_bytes / p.file_bytes).toFixed(1)}×` : "—"}</td>
                                <td className="num px-3 py-2 text-right">{p.psnr?.toFixed(1)} dB</td>
                                <td className="num px-3 py-2 text-right">{p.ssim?.toFixed(3)}</td>
                                <td className={cn("num px-3 py-2 font-semibold", p.decision === "PASS" ? "text-success" : "text-destructive")}>{p.decision}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </StaggerItem>
            </Stagger>
          )}
        </div>
      </div>
    </>
  );
}
