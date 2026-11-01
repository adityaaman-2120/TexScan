import { FileImage, Trophy, X } from "lucide-react";
import { useId, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { METHOD_LABELS, type Method } from "@/api/types";
import { requireNav } from "@/app/nav";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dropzone } from "@/features/inspect/Dropzone";
import { DIFF_COLORS } from "./diffMap";
import { BenchmarkHeatmap } from "./BenchmarkHeatmap";
import { MethodCard, type ViewMode } from "./MethodCard";
import { SampleBrowser } from "./SampleBrowser";
import { useArena, type WorkingSize } from "./useArena";
import { bestOf, cleanLeaders, fastest, pickWinner, truthOf } from "./winner";
import { useState } from "react";

const item = requireNav("/arena");
const METHODS: Method[] = ["fft", "gabor", "golden_template", "local_statistics"];
const rgb = (c: readonly number[]) => `rgb(${c.join(",")})`;

function FileSlot({ title, hint, file, url, onFile, onClear }: { title: string; hint: string; file: File | null; url: string | null; onFile: (f: File) => void; onClear: () => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">{title}</div>
      <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2.5">
        <div className="size-14 shrink-0 overflow-hidden rounded-md border bg-black/40">
          {url ? <img src={url} alt={`${title} preview`} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-muted-foreground"><FileImage className="size-5" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs">{file ? file.name : "None"}</div>
          <div className="text-[11px] leading-snug text-muted-foreground">{hint}</div>
        </div>
        <input id={id} ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="sm" onClick={() => input.current?.click()}>{file ? "Replace" : "Choose"}</Button>
          {file && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${title}`} onClick={onClear}><X /></Button>}
        </div>
      </div>
    </div>
  );
}

function Compare() {
  const arena = useArena();
  const [mode, setMode] = useState<ViewMode>("overlay");
  const { result, running, gtUrl } = arena;

  const truth = truthOf(Boolean(result?.ground_truth_provided), result?.ground_truth_defective);
  const results = result?.results ?? [];
  const winner = pickWinner(results, truth);
  const quick = fastest(results);
  const win = results.find((r) => r.method === winner);
  const tied = truth === "clean" && !winner ? cleanLeaders(results) : [];
  const best = { iou: bestOf(results, "iou"), dice: bestOf(results, "dice"), precision: bestOf(results, "precision"), recall: bestOf(results, "recall") };
  const effectiveMode: ViewMode = mode === "error" && !gtUrl ? "overlay" : mode;

  return (
    <div className="space-y-5">
      <SampleBrowser onMvtec={arena.loadMvtec} activeLabel={arena.label} />

      <Card className="gap-4 p-4 py-4">
        {!arena.image ? (
          <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Dropzone compact onFile={(f) => f && arena.setImage(f)} />
            <p className="text-[13px] text-muted-foreground">Upload your own image (optionally with its ground-truth mask), or pick an MVTec AD sample above. All four methods run on the same image and are scored against the mask.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <FileSlot title="Image" hint="the image to inspect" file={arena.image} url={arena.imageUrl} onFile={arena.setImage} onClear={() => arena.setImage(null)} />
            <FileSlot title="Ground-truth mask (optional)" hint="white = defect. Enables IoU, Dice, precision, recall and the winner." file={arena.groundTruth} url={gtUrl} onFile={arena.setGroundTruth} onClear={() => arena.setGroundTruth(null)} />
            <FileSlot title="Reference (optional)" hint="a good image of the same material, for the golden template" file={arena.reference} url={arena.referenceUrl} onFile={arena.setReference} onClear={() => arena.setReference(null)} />
          </div>
        )}
        {arena.image && (
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            <span className="text-xs text-muted-foreground">Working size</span>
            <Segmented label="Working size" value={String(arena.size)} onChange={(v) => arena.setSize(Number(v) as WorkingSize)} options={[{ value: "512", label: "512 px" }, { value: "1024", label: "1024 px" }]} />
            <span className="text-[11px] text-muted-foreground">{running ? "Running all four methods…" : "Every method runs with its default, untuned settings."}</span>
          </div>
        )}
      </Card>

      {!arena.image ? (
        <Card><EmptyState illustration="compare" title="Nothing to compare yet" description="Upload an image or pick an MVTec AD sample and the four detection methods will be shown side by side." /></Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3" aria-live="polite">
            <p className="flex items-center gap-2 text-[13.5px]">
              <Trophy className={winner ? "size-4 text-primary" : "size-4 text-muted-foreground"} />
              {running && !result ? (
                "Comparing…"
              ) : truth === "none" ? (
                <span className="text-muted-foreground">No ground truth, so nothing to score against: add a mask to crown a winner.{quick && ` Fastest: ${METHOD_LABELS[quick as Method]}.`}</span>
              ) : win ? (
                <span>
                  <strong>{METHOD_LABELS[win.method as Method]}</strong> wins{truth === "defective" ? <> with IoU <span className="num">{win.iou?.toFixed(3)}</span> (Dice <span className="num">{win.dice?.toFixed(3)}</span>)</> : <> this clean image: correct PASS, smallest false alarm</>}.
                </span>
              ) : tied.length > 1 ? (
                <span>
                  <strong>Tie:</strong> {tied.length} methods correctly passed this clean image with the same false-alarm area ({tied[0]!.defect_area_percent?.toFixed(2)}%).{quick && ` Fastest: ${METHOD_LABELS[quick as Method]}.`}
                </span>
              ) : (
                <span className="text-muted-foreground">{truth === "clean" ? "Every method raised a false alarm on this clean image." : "No method overlapped the defect."}</span>
              )}
            </p>
            <Segmented
              label="What to show"
              value={effectiveMode}
              onChange={setMode}
              options={[{ value: "overlay", label: "Overlay" }, { value: "mask", label: "Mask" }, { value: "error", label: "Error map", disabled: !gtUrl }]}
            />
          </div>

          {effectiveMode === "error" && (
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted-foreground" aria-label="Error map legend">
              <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: rgb(DIFF_COLORS.tp) }} aria-hidden />found (true positive)</li>
              <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: rgb(DIFF_COLORS.fp) }} aria-hidden />false alarm</li>
              <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: rgb(DIFF_COLORS.fn) }} aria-hidden />missed</li>
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {METHODS.map((m) => (
              <MethodCard
                key={m}
                method={m}
                result={results.find((r) => r.method === m)}
                winner={winner === m}
                fastest={quick === m && results.filter((r) => r.status === "ok").length > 1}
                truth={truth}
                mode={effectiveMode}
                gtUrl={gtUrl}
                imageUrl={arena.imageUrl}
                best={best}
                loading={running && !result}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ArenaPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "benchmark" ? "benchmark" : "compare";
  return (
    <>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />
      <Tabs value={tab} onValueChange={(v) => setParams(v === "compare" ? {} : { tab: v })}>
        <TabsList aria-label="Arena views">
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
        </TabsList>
        <TabsContent value="compare"><Compare /></TabsContent>
        <TabsContent value="benchmark"><BenchmarkHeatmap /></TabsContent>
      </Tabs>
    </>
  );
}
