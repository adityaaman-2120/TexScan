import { motion, useInView, useScroll, useSpring } from "framer-motion";
import { useRef } from "react";
import { MarkerArt, ReportArt, RollArt } from "./StepArt";

const STEPS = [
  {
    n: "01",
    title: "Calibrate",
    fig: "FIG. 1  a marker of known size",
    text: "Print the marker, photograph it once, and TexScan learns how big a pixel is. From then on, defects are measured in millimetres and inches. A few clean pictures teach it what good fabric looks like.",
    Art: MarkerArt,
  },
  {
    n: "02",
    title: "Scan the roll",
    fig: "FIG. 2  pictures along the roll",
    text: "Add pictures along the roll, or capture from a live camera, each with its metre mark. Every defect is found, measured and placed on the roll.",
    Art: RollArt,
  },
  {
    n: "03",
    title: "Get a graded report",
    fig: "FIG. 3  the record you sign",
    text: "The four-point system scores the roll and accepts or rejects it against your limit. You get a report with a defect map and signature lines.",
    Art: ReportArt,
  },
];

function Step({ step }: { step: (typeof STEPS)[number] }) {
  const ref = useRef<HTMLLIElement>(null);
  const reached = useInView(ref, { margin: "-38% 0px -38% 0px" });
  const { Art } = step;
  return (
    <li ref={ref} className="relative pb-20 last:pb-0">
      <motion.span
        aria-hidden
        animate={{ scale: reached ? 1 : 0.7, backgroundColor: reached ? "var(--primary)" : "var(--background)" }}
        transition={{ type: "spring", stiffness: 380, damping: 24 }}
        className="absolute -left-14 top-3 size-[1.15rem] rounded-full border-2 border-primary sm:-left-[4.6rem]"
      />
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Step {step.n}</p>
      <h3 className="mt-2 font-display text-3xl sm:text-4xl">{step.title}</h3>
      <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground xl:max-w-xl xl:text-base">{step.text}</p>
      <figure className="mt-7 max-w-md xl:max-w-xl">
        <div className="rounded-lg border bg-card/60 p-3">
          <Art />
        </div>
        <figcaption className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{step.fig}</figcaption>
      </figure>
    </li>
  );
}

/** Three steps along a thread that draws itself as you scroll. */
export function HowItWorks() {
  const track = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start 62%", "end 58%"] });
  const grow = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.4 });

  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 border-y bg-muted/25 py-14 sm:py-20">
      <div className="mx-auto grid max-w-[1680px] gap-14 px-4 sm:px-6 lg:px-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">How it works</p>
          <h2 id="how-title" className="font-display text-[clamp(2.4rem,4.4vw,4.8rem)] leading-[1]">
            Three steps, <em>one thread</em> from roll to report.
          </h2>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted-foreground">Nothing to install on the loom and nothing to connect to the cloud: a computer, a camera and a printed marker.</p>
        </div>

        <ol ref={track} className="relative pl-14 sm:pl-[4.6rem]" aria-label="The three steps">
          <span aria-hidden className="stitch-v absolute bottom-3 left-[0.62rem] top-3 sm:left-[0.62rem]" style={{ marginLeft: 0 }} />
          <motion.span aria-hidden style={{ scaleY: grow, transformOrigin: "top" }} className="absolute bottom-3 left-[0.5rem] top-3 w-[3px] rounded-full bg-primary" />
          {STEPS.map((s) => (
            <Step key={s.n} step={s} />
          ))}
        </ol>
      </div>
    </section>
  );
}
