import { motion } from "framer-motion";
import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroCloth } from "./HeroCloth";

const POINTS = ["Defects measured in millimetres and inches", "Four-point grading for every roll", "Runs on your own computer"];
const FOUND = ["Hole", "Stain", "Pulled thread"];

/** The scanner window: a woven swatch under a scan beam, with its defects named. An illustration, and labelled as one. */
function ScannerWindow() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_40px_90px_-48px_rgba(15,23,42,0.6)]">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Scanner view</span>
        <span className="ml-auto text-[11px] text-muted-foreground">Illustration</span>
      </div>
      <div className="relative aspect-[4/3] bg-[#05070b]">
        <HeroCloth className="absolute inset-0 size-full" />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <span className="mr-1 text-xs text-muted-foreground">Found:</span>
        {FOUND.map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium">
            <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative border-b">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_65%_at_85%_-10%,color-mix(in_oklab,var(--primary)_11%,transparent),transparent)]" />
      <div className="mx-auto grid max-w-[1680px] items-center gap-12 px-4 pb-14 pt-8 sm:px-6 lg:px-12 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.06fr)] lg:gap-16 lg:pb-20 lg:pt-12 xl:gap-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-primary" />
            Affordable fabric inspection for small textile units
          </p>
          <h1 className="font-display text-[clamp(2.9rem,5.4vw,6.3rem)] leading-[0.98]">
            Fabric inspection that fits a <em className="text-primary">small textile unit.</em>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-muted-foreground xl:max-w-2xl xl:text-[19px]">
            Small units still check fabric by eye: slow, tiring and different from one inspector to the next. Machine-vision systems would fix that, but they cost far more than a small unit can justify.
          </p>
          <p className="mt-4 max-w-xl text-pretty text-[17px] leading-relaxed xl:max-w-2xl xl:text-[19px]">
            <strong className="font-semibold">TexScan is the affordable alternative:</strong> a computer, a camera and software that finds defects, measures them and grades the roll.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button size="lg" asChild>
              <a href="/app">
                Open the app
                <ArrowRight />
              </a>
            </Button>
            <a href="#demo" className="group inline-flex items-center gap-2 text-sm font-medium outline-none focus-visible:underline">
              Try the demo
              <ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
            </a>
          </div>
          <ul className="mt-9 space-y-2.5">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: [0.2, 0.7, 0.2, 1] }}>
          <ScannerWindow />
          <p className="sr-only">A decorative picture of woven cloth with a hole, a stain and a pulled thread being picked out by a scanner.</p>
        </motion.div>
      </div>
    </section>
  );
}
