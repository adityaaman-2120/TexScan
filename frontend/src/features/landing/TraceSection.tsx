import { ArrowRight, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";
import { TRACE } from "./trace";

const ADVANCE_MS = 2400;

function openXRay() {
  useUi.getState().setEngineering(true); // remembered, so the Engineering section is already open in the app
  window.location.assign("/app/xray");
}

const POINTS = [
  { title: "Every stage is visible", text: "The Pipeline X-Ray steps through each image the system made, with the explanation and formula you see here." },
  { title: "Rules you can read", text: "Roll grading follows the four-point system. The rules are written down, and the acceptance limit and the hole rule are yours to set." },
  { title: "Tune it yourself", text: "Engineering mode adds the detailed controls and diagnostic pages, such as method comparison and robustness tests." },
];

/** "No black box": the real steps of an inspection, with their formulas. Plays through by itself; click a step to hold it. */
export function TraceSection() {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % TRACE.length), ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [held]);

  return (
    <section id="explainable" aria-labelledby="explain-title" className="scroll-mt-16 border-y bg-muted/25 py-14 sm:py-20">
      <div className="mx-auto grid max-w-[1680px] gap-14 px-4 sm:px-6 lg:px-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">Explainable</p>
          <h2 id="explain-title" className="font-display text-[clamp(2.6rem,4.8vw,5.2rem)] leading-[1]">
            No <em>black box.</em>
          </h2>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            TexScan uses classical image processing, not a trained model. There are no hidden weights: every verdict can be traced back through the steps that produced it. These are the real steps and formulas.
          </p>

          <ul className="mt-9 max-w-md">
            {POINTS.map((p) => (
              <li key={p.title}>
                <div className="stitch" aria-hidden />
                <div className="py-4">
                  <h3 className="text-sm font-semibold">{p.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{p.text}</p>
                </div>
              </li>
            ))}
            <li aria-hidden>
              <div className="stitch" />
            </li>
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={openXRay}>
              <Eye />
              Open the Pipeline X-Ray
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <a href="/app">
                Open the app
                <ArrowRight />
              </a>
            </Button>
          </div>
          <p className="mt-3 max-w-md text-xs text-muted-foreground">The X-Ray is part of Engineering mode, which this button turns on. You can turn it off again in Settings.</p>
        </div>

        <div className="flex flex-col rounded-2xl border bg-card/70 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)] backdrop-blur">
          <div className="flex items-center gap-3 border-b px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2 rounded-full bg-border" />
              <span className="size-2 rounded-full bg-border" />
              <span className="size-2 rounded-full bg-border" />
            </span>
            Trace · a woven fabric
            <span className="ml-auto">{held ? "held" : "playing"}</span>
          </div>
          <ol className="p-2" aria-label="Steps of an inspection">
            {TRACE.map((t, i) => {
              const on = i === active;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-current={on ? "step" : undefined}
                    onClick={() => {
                      setActive(i);
                      setHeld(true);
                    }}
                    className={cn("group relative block w-full rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring", on ? "bg-primary/10" : "hover:bg-accent/50")}
                  >
                    <span aria-hidden className={cn("absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary transition-opacity", on ? "opacity-100" : "opacity-0")} />
                    <span className="flex items-baseline gap-3">
                      <span className="num w-5 text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                      <span className={cn("text-sm font-medium", on ? "text-foreground" : "text-muted-foreground")}>{t.name}</span>
                    </span>
                    <span className={cn("mt-1 grid transition-all duration-300", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                      <span className="overflow-hidden">
                        <code className="num block pl-8 text-[12.5px] leading-relaxed text-primary">{t.formula}</code>
                        <span className="block pb-1 pl-8 pt-1 text-[13px] leading-relaxed text-muted-foreground">{t.why}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-auto border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">These are the steps for a woven fabric with a repeating pattern. Other fabrics use other detection methods; the app lets you compare them.</p>
        </div>
      </div>
    </section>
  );
}
