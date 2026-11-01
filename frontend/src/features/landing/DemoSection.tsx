import { CircleCheck, CircleX, Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { postForm } from "@/api/client";
import { errorMessage, isUnreachable } from "@/api/errors";
import type { ArenaOut } from "@/api/types";
import { DEFECT_LABELS } from "@/features/inspect/defectLabels";
import { formatShare, locationName, share, sizeClass } from "@/features/inspect/operator";
import { cn } from "@/lib/utils";
import { makeSample, SAMPLES, SAMPLE_SIZE, type SampleKind } from "./sample";

const MAX_ROWS = 4;
const THUMB = 64;

type Run =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string; unreachable: boolean }
  | { status: "done"; kind: SampleKind; decision: "PASS" | "FAIL"; overlay: string | null; defects: ArenaOut["results"][number]["defects"]; ms: number };

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare the sample image."))), "image/png"));
}

/** A small picture of a sample, drawn from the same generator as the specimen. */
function Swatch({ kind }: { kind: SampleKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) {
      const s = makeSample(kind, THUMB);
      ctx.putImageData(new ImageData(s.data, s.width, s.height), 0, 0);
    }
  }, [kind]);
  return <canvas ref={ref} width={THUMB} height={THUMB} aria-hidden className="size-12 shrink-0 rounded-[3px] border" />;
}

/** The four corner marks of a viewfinder. */
function Corners() {
  const base = "pointer-events-none absolute size-4 border-primary";
  return (
    <>
      <span aria-hidden className={cn(base, "left-2 top-2 border-l-2 border-t-2")} />
      <span aria-hidden className={cn(base, "right-2 top-2 border-r-2 border-t-2")} />
      <span aria-hidden className={cn(base, "bottom-2 left-2 border-b-2 border-l-2")} />
      <span aria-hidden className={cn(base, "bottom-2 right-2 border-b-2 border-r-2")} />
    </>
  );
}

const LABEL = "font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground";

/** An inspection bench: pick a specimen, run a real inspection through the API, read the result. Nothing is saved. */
export function DemoSection() {
  const [kind, setKind] = useState<SampleKind>("hole");
  const [run, setRun] = useState<Run>({ status: "idle" });
  const canvas = useRef<HTMLCanvasElement>(null);
  const ranOnce = useRef(false);
  const sample = useMemo(() => makeSample(kind), [kind]);
  const info = SAMPLES.find((s) => s.kind === kind)!;

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) ctx.putImageData(new ImageData(sample.data, sample.width, sample.height), 0, 0);
  }, [sample]);

  const inspect = async (which: SampleKind) => {
    const el = canvas.current;
    if (!el) return;
    ranOnce.current = true;
    setRun({ status: "running" });
    try {
      const form = new FormData();
      form.append("image", new File([await toBlob(el)], `sample-${which}.png`, { type: "image/png" }));
      form.append("methods", "fft");
      form.append("config", JSON.stringify({ max_side: SAMPLE_SIZE }));
      const out = await postForm<ArenaOut>("/arena", form); // the Method Arena endpoint: it runs the pipeline and stores nothing
      const result = out.results[0];
      if (!result || result.status !== "ok" || !result.decision) throw new Error(result?.message ?? "The inspection did not return a result.");
      setRun({ status: "done", kind: which, decision: result.decision, overlay: result.overlay ?? null, defects: result.defects, ms: result.total_ms ?? 0 });
    } catch (e) {
      setRun({ status: "error", message: errorMessage(e), unreachable: isUnreachable(e) });
    }
  };

  const pick = (next: SampleKind) => {
    setKind(next);
    setRun({ status: "idle" });
    if (ranOnce.current) window.setTimeout(() => void inspect(next), 0); // after the first run, choosing a specimen runs it
  };

  const done = run.status === "done" && run.kind === kind ? run : null;
  const state = run.status === "running" ? "Scanning" : run.status === "error" ? "Fault" : done ? "Done" : "Ready";

  return (
    <div className="overflow-hidden rounded-2xl border bg-card/70 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)] backdrop-blur">
      <div className={cn(LABEL, "flex items-center gap-3 border-b px-4 py-3")}>
        <span className="flex items-center gap-2 text-foreground">
          <span aria-hidden className={cn("size-2 rounded-full", run.status === "running" ? "animate-pulse bg-warning" : run.status === "error" ? "bg-destructive" : done ? "bg-success" : "bg-primary")} />
          {state}
        </span>
        <span className="ml-auto hidden sm:inline">Bench 01 · specimen: {info.label}</span>
      </div>

      <div className="grid lg:grid-cols-[13.5rem_minmax(0,1fr)_minmax(0,1fr)]">
        <div role="radiogroup" aria-label="Sample cloth" className="flex gap-1 overflow-x-auto border-b p-2 lg:flex-col lg:border-b-0 lg:border-r lg:p-3">
          {SAMPLES.map((s) => {
            const on = s.kind === kind;
            return (
              <button
                key={s.kind}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(s.kind)}
                className={cn(
                  "flex min-w-40 items-center gap-3 rounded-lg border border-transparent p-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring lg:min-w-0",
                  on ? "border-primary/40 bg-primary/10" : "hover:bg-accent/60",
                )}
              >
                <Swatch kind={s.kind} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3 p-4 lg:border-r [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[520px]">
          <p className={LABEL}>Specimen</p>
          <div className="relative overflow-hidden rounded-md border bg-muted/60 p-0.5">
            <canvas ref={canvas} width={SAMPLE_SIZE} height={SAMPLE_SIZE} role="img" aria-label={`Sample cloth: ${info.label}. ${info.hint}`} className="aspect-square w-full" />
            <Corners />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void inspect(kind)}
              disabled={run.status === "running"}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-60"
            >
              {run.status === "running" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {run.status === "running" ? "Inspecting…" : done ? "Inspect again" : "Inspect this sample"}
            </button>
            <span className="text-xs text-muted-foreground">Generated in your browser · {SAMPLE_SIZE} × {SAMPLE_SIZE}</span>
          </div>
        </div>

        <div className="space-y-3 p-4 [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[520px]" aria-live="polite">
          <p className={LABEL}>Scan result</p>
          <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-muted/60 p-0.5">
            {done?.overlay ? (
              <img src={done.overlay} alt={`Result for the ${info.label.toLowerCase()} sample with defects outlined`} className="size-full object-cover" />
            ) : run.status === "running" ? (
              <Loader2 className="size-8 animate-spin text-primary" aria-label="Inspecting" />
            ) : run.status === "error" ? (
              <div className="max-w-xs space-y-2 p-6 text-center" role="alert">
                <p className="text-sm font-semibold">{run.unreachable ? "The demo needs the TexScan backend" : "The inspection failed"}</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{run.unreachable ? "Start it with make dev, then try again. Nothing is sent anywhere else." : run.message}</p>
              </div>
            ) : (
              <p className="max-w-[15rem] text-center font-mono text-xs leading-relaxed text-muted-foreground">Awaiting a specimen. Press Inspect and the result appears here.</p>
            )}
            <Corners />
          </div>

          {done ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  role="status"
                  aria-label={`Decision: ${done.decision}`}
                  className={cn(
                    "num inline-flex items-center gap-2 rounded-md border-2 px-3.5 py-1.5 text-2xl font-bold tracking-[0.2em]",
                    done.decision === "PASS" ? "border-success/50 bg-success/10 text-success" : "border-destructive/50 bg-destructive/10 text-destructive",
                  )}
                >
                  {done.decision === "PASS" ? <CircleCheck className="size-6" /> : <CircleX className="size-6" />}
                  {done.decision}
                </div>
                <span className="num text-xs text-muted-foreground">
                  {done.defects.length === 0 ? "No defects found" : `${done.defects.length} ${done.defects.length === 1 ? "defect" : "defects"}`} · {Math.round(done.ms)} ms
                </span>
              </div>
              {done.defects.length > 0 && (
                <ul className="divide-y rounded-md border" aria-label="Defects found">
                  {done.defects.slice(0, MAX_ROWS).map((d) => {
                    const [x, y, w, h] = d.bbox;
                    return (
                      <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-[13px]">
                        <span className="font-medium">{DEFECT_LABELS[d.defect_type ?? "unknown"]}</span>
                        <span className="num text-xs text-muted-foreground">
                          {sizeClass(d.area, SAMPLE_SIZE, SAMPLE_SIZE)} · {formatShare(share(d.area, SAMPLE_SIZE, SAMPLE_SIZE))} of the picture
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">{locationName([x, y, w, h], SAMPLE_SIZE, SAMPLE_SIZE)}</span>
                      </li>
                    );
                  })}
                  {done.defects.length > MAX_ROWS && <li className="px-3 py-2 text-xs text-muted-foreground">and {done.defects.length - MAX_ROWS} more</li>}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nothing is saved, and no history is kept.</p>
          )}
        </div>
      </div>

      <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        A real inspection, run by the TexScan backend with default settings. Defect names are a best guess. The sample is not calibrated, so sizes are a share of the picture; with a calibrated profile the app reports millimetres and inches.
      </p>
    </div>
  );
}
