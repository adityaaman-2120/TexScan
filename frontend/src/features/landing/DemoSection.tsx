import { CircleCheck, CircleX, Loader2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { postForm } from "@/api/client";
import { errorMessage, isUnreachable } from "@/api/errors";
import type { ArenaOut } from "@/api/types";
import { formatShare, locationName, share, sizeClass } from "@/features/inspect/operator";
import { cn } from "@/lib/utils";
import { enclosing, groupByProximity, padBox, reasonOf, ringContrast, type Box, type Pixels } from "./defectBoxes";
import { DEMO_CONFIG, DEMO_METHOD, loadSample, SAMPLES, SAMPLE_SIZE, type SampleKind } from "./sample";

const MAX_ROWS = 4;
const THUMB = 64;
const MERGE_GAP = 40; // pieces of one damaged spot closer than this (in sample pixels) get one box

type DefectOut = ArenaOut["results"][number]["defects"][number];

type Run =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string; unreachable: boolean }
  | { status: "done"; kind: SampleKind; decision: "PASS" | "FAIL"; areas: Area[]; ms: number };

interface Area {
  /** The box to draw: the flagged pieces together, padded. */
  box: Box;
  /** The flagged region itself, before padding. */
  core: Box;
  area: number;
  reason: string;
}

const boxOf = (d: DefectOut): Box => ({ x: d.bbox[0], y: d.bbox[1], w: d.bbox[2], h: d.bbox[3] });

/** One red box and one written reason per damaged spot: nearby flagged pieces are merged, and the reason comes from the largest piece. */
function areasOf(defects: DefectOut[], pixels: Pixels): Area[] {
  return groupByProximity(defects.map(boxOf), MERGE_GAP).map((idx) => {
    const members = idx.map((i) => defects[i]!);
    const main = members.reduce((a, b) => (b.area > a.area ? b : a));
    const core = enclosing(members.map(boxOf));
    const contrast = main.contrast ?? ringContrast(pixels, boxOf(main)); // the arena does not report contrast, so measure it on the picture
    return { box: padBox(core, SAMPLE_SIZE, SAMPLE_SIZE), core, area: members.reduce((s, d) => s + d.area, 0), reason: reasonOf({ ...main, contrast }) };
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare the sample image."))), "image/png"));
}

/** A small picture of a sample: its photo, scaled down. */
function Swatch({ kind }: { kind: SampleKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    loadSample(kind)
      .then((img) => {
        const ctx = live ? ref.current?.getContext("2d") : null;
        if (ctx) {
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, THUMB, THUMB);
        }
      })
      .catch(() => undefined); // the swatch just stays blank
    return () => {
      live = false;
    };
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
  const info = SAMPLES.find((s) => s.kind === kind)!;

  useEffect(() => {
    let live = true;
    loadSample(kind)
      .then((img) => {
        const ctx = live ? canvas.current?.getContext("2d") : null;
        if (ctx) ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      })
      .catch((e) => setRun({ status: "error", message: errorMessage(e), unreachable: false }));
    return () => {
      live = false;
    };
  }, [kind]);

  const inspect = async (which: SampleKind) => {
    const el = canvas.current;
    if (!el) return;
    ranOnce.current = true;
    setRun({ status: "running" });
    try {
      const form = new FormData();
      form.append("image", new File([await toBlob(el)], `sample-${which}.png`, { type: "image/png" }));
      form.append("methods", DEMO_METHOD);
      form.append("config", JSON.stringify(DEMO_CONFIG));
      const out = await postForm<ArenaOut>("/arena", form); // the Method Arena endpoint: it runs the pipeline and stores nothing
      const result = out.results[0];
      if (!result || result.status !== "ok" || !result.decision) throw new Error(result?.message ?? "The inspection did not return a result.");
      const pixels = el.getContext("2d")!.getImageData(0, 0, el.width, el.height);
      setRun({ status: "done", kind: which, decision: result.decision, areas: areasOf(result.defects, pixels), ms: result.total_ms ?? 0 });
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
  const areas = done?.areas ?? [];
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
            <span className="text-xs text-muted-foreground">A crop of a real photo · {SAMPLE_SIZE} × {SAMPLE_SIZE}</span>
          </div>
        </div>

        <div className="space-y-3 p-4 [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[520px]" aria-live="polite">
          <p className={LABEL}>Scan result</p>
          <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-muted/60 p-0.5">
            {done ? (
              <>
                <img
                  src={info.src}
                  alt={`Result for the ${info.label.toLowerCase()} sample: ${areas.length === 0 ? "nothing flagged" : `${areas.length} flagged ${areas.length === 1 ? "area" : "areas"} boxed in red`}`}
                  className="size-full object-cover"
                />
                {areas.map((a, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="pointer-events-none absolute border-2 border-destructive shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                    style={{ left: `${(a.box.x / SAMPLE_SIZE) * 100}%`, top: `${(a.box.y / SAMPLE_SIZE) * 100}%`, width: `${(a.box.w / SAMPLE_SIZE) * 100}%`, height: `${(a.box.h / SAMPLE_SIZE) * 100}%` }}
                  >
                    <span className="num absolute -top-px left-0 -translate-y-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground">{i + 1}</span>
                  </span>
                ))}
              </>
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
                  {areas.length === 0 ? "No defects found" : `${areas.length} ${areas.length === 1 ? "area" : "areas"} flagged`} · {Math.round(done.ms)} ms
                </span>
              </div>
              {areas.length > 0 && (
                <ul className="divide-y rounded-md border" aria-label="Flagged areas">
                  {areas.slice(0, MAX_ROWS).map((a, i) => (
                    <li key={i} className="flex items-start gap-3 px-3 py-2 text-[13px]">
                      <span className="num mt-0.5 grid size-5 shrink-0 place-items-center bg-destructive text-[10px] font-bold text-destructive-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{a.reason}</span>
                        <span className="num block text-xs text-muted-foreground">
                          {sizeClass(a.area, SAMPLE_SIZE, SAMPLE_SIZE)} · {formatShare(share(a.area, SAMPLE_SIZE, SAMPLE_SIZE))} of the picture · {locationName([a.core.x, a.core.y, a.core.w, a.core.h], SAMPLE_SIZE, SAMPLE_SIZE)}
                        </span>
                      </span>
                    </li>
                  ))}
                  {areas.length > MAX_ROWS && <li className="px-3 py-2 text-xs text-muted-foreground">and {areas.length - MAX_ROWS} more</li>}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nothing is saved, and no history is kept.</p>
          )}
        </div>
      </div>

      <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        A real inspection, run by the TexScan backend. The settings are tuned for this cloth: real fabric is textured, so the plain defaults raise false alarms on it. Each red box is drawn around what the detector flagged, with some margin, and the reason is read from what was measured there, not a guess at what the defect is. The sample is not calibrated, so sizes are a share of the picture; with a calibrated profile the app reports millimetres and inches.
      </p>
    </div>
  );
}
