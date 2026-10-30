import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, ScanSearch } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fileUrl } from "@/api/client";
import type { InspectionOut } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { stageInfo } from "./stageInfo";

const STEP_MS = 2800;

interface XRayProps {
  result: InspectionOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function XRay({ result, open, onOpenChange }: XRayProps) {
  const steps = useMemo(
    () =>
      Object.entries(result.stage_urls).map(([name, url]) => {
        const info = stageInfo(name, result.config);
        return { name, url, info, ms: info.timing ? result.timings_ms[info.timing] : undefined };
      }),
    [result],
  );
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = steps.length - 1;
  const atEnd = index >= last;
  const stepper = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (open) {
      setIndex(0);
      setPlaying(false);
    }
  }, [open, result.id]);

  // auto-advance; stops on the last step
  useEffect(() => {
    if (!open || !playing) return;
    const timer = setTimeout(() => {
      if (index >= last) setPlaying(false);
      else setIndex(index + 1);
    }, STEP_MS);
    return () => clearTimeout(timer);
  }, [open, playing, index, last]);

  useEffect(() => {
    (stepper.current?.children[index] as HTMLElement | undefined)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [index]);

  const togglePlay = () => {
    if (!playing && atEnd) setIndex(0);
    setPlaying((p) => !p);
  };
  const go = (to: number) => setIndex(Math.min(last, Math.max(0, to)));
  const step = steps[index]!;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(index + 1);
          else if (e.key === "ArrowLeft") go(index - 1);
          else if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
            e.preventDefault();
            togglePlay();
          }
        }}
        className="left-0 top-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background/95 p-0 backdrop-blur-xl sm:max-w-none"
      >
        <DialogDescription className="sr-only">
          Every image the pipeline produced, in order, with a plain-English explanation and the formula for each step.
        </DialogDescription>

        {/* header */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4 pr-14">
          <ScanSearch className="size-5 text-primary" />
          <DialogTitle className="whitespace-nowrap text-sm font-semibold">Pipeline X-Ray</DialogTitle>
          <Badge variant="outline" className="hidden sm:inline-flex">{result.method}</Badge>
          <span className="num ml-1 whitespace-nowrap text-xs text-muted-foreground sm:ml-2">
            {String(index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous stage" onClick={() => go(index - 1)} disabled={index === 0}>
              <ChevronLeft />
            </Button>
            <Button onClick={togglePlay} className="min-w-20 sm:min-w-24" aria-label={playing ? "Pause" : atEnd ? "Replay" : "Play"}>
              {playing ? <Pause /> : atEnd ? <RotateCcw /> : <Play />}
              {playing ? "Pause" : atEnd ? "Replay" : "Play"}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next stage" onClick={() => go(index + 1)} disabled={atEnd}>
              <ChevronRight />
            </Button>
          </div>
        </div>

        {/* stage */}
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
          <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-xl border bg-black/50">
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={step.name}
                src={fileUrl(step.url)}
                alt={step.info.title}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="max-h-full max-w-full object-contain"
              />
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.aside
              key={step.name}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.22 }}
              className="flex flex-col gap-4 lg:overflow-y-auto"
            >
              <div>
                <div className="num text-xs text-primary">STEP {String(index + 1).padStart(2, "0")}</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">{step.info.title}</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{step.info.explain}</p>
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">The maths</div>
                <code className="num block whitespace-pre-wrap rounded-lg border bg-muted/50 px-3.5 py-3 text-[13px] leading-relaxed text-primary">
                  {step.info.formula}
                </code>
              </div>
              <dl className="num grid grid-cols-2 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">stage image</dt>
                <dd className="text-right">{step.name}</dd>
                {step.ms !== undefined && (
                  <>
                    <dt className="text-muted-foreground">time taken</dt>
                    <dd className="text-right">{step.ms.toFixed(1)} ms</dd>
                  </>
                )}
              </dl>
              <p className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
                <Kbd>←</Kbd>
                <Kbd>→</Kbd> step · <Kbd>Space</Kbd> play / pause · <Kbd>Esc</Kbd> close
              </p>
            </motion.aside>
          </AnimatePresence>
        </div>

        {/* stepper */}
        <div className="shrink-0 border-t bg-card/60 px-4 pb-3 pt-3">
          <div className="relative mb-3 h-0.5 overflow-hidden rounded-full bg-border" aria-hidden>
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${(last === 0 ? 1 : index / last) * 100}%` }}
              transition={{ duration: 0.35 }}
            />
            {playing && !atEnd && (
              <motion.div
                key={index}
                className="absolute inset-y-0 bg-primary/50"
                style={{ left: `${(index / last) * 100}%` }}
                initial={{ width: 0 }}
                animate={{ width: `${100 / last}%` }}
                transition={{ duration: STEP_MS / 1000, ease: "linear" }}
              />
            )}
          </div>
          <ol ref={stepper} className="flex gap-2 overflow-x-auto pb-1" aria-label="Pipeline stages">
            {steps.map((s, i) => (
              <li key={s.name} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === index ? "step" : undefined}
                  className={cn(
                    "group flex w-[104px] flex-col gap-1.5 rounded-lg border p-1.5 text-left outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring",
                    i === index ? "border-primary bg-primary/10" : i < index ? "border-primary/30 hover:border-primary/60" : "opacity-70 hover:opacity-100",
                  )}
                >
                  <img src={fileUrl(s.url)} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-md bg-black/40 object-cover" />
                  <span className="num flex items-baseline gap-1 text-[10px] text-muted-foreground">
                    <span className={i === index ? "text-primary" : ""}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="truncate text-foreground">{s.info.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
