import { motion } from "framer-motion";
import { Camera, ClipboardCheck, Eye, FileText, Laptop, Ruler, type LucideIcon } from "lucide-react";

interface Capability {
  icon: LucideIcon;
  title: string;
  text: string;
}

const ITEMS: Capability[] = [
  { icon: Ruler, title: "Real-world measurement", text: "Print a marker or use a ruler once. Every defect is then reported in millimetres and inches, with its length, width and area." },
  { icon: ClipboardCheck, title: "Four-point roll grading", text: "Each roll is scored by defect length with a cap per yard, converted to points per 100 square yards, and accepted or rejected against your limit." },
  { icon: Camera, title: "Webcam or phone camera", text: "Inspect pictures you already have, or capture from a live camera. A phone on the same Wi-Fi works as the camera." },
  { icon: FileText, title: "Reports and records", text: "PDF reports for single inspections, batches and whole rolls, with a history of everything you have checked and a dashboard of the trends." },
  { icon: Eye, title: "Every result explained", text: "No trained model. The Pipeline X-Ray shows each processing step, in order, with its formula and a plain-English reason." },
  { icon: Laptop, title: "Stays on your computer", text: "There is no cloud and no account. Pictures and results are kept in a local database on the machine that runs TexScan." },
];

/** What the product does, in a plain grid: no boxes, just hairlines. */
export function Capabilities() {
  return (
    <section id="features" aria-labelledby="features-title" className="mx-auto max-w-[1680px] scroll-mt-16 px-4 py-14 sm:px-6 lg:px-12 sm:py-20">
      <div className="mb-12 grid items-end gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">What you get</p>
          <h2 id="features-title" className="font-display text-[clamp(2.4rem,4.4vw,4.8rem)] leading-[1]">
            Everything a small unit needs to <em>inspect and report.</em>
          </h2>
        </div>
        <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground md:justify-self-end">From the first photo to the signed report, in one place and on your own computer.</p>
      </div>
      <ul className="grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:gap-x-20">
        {ITEMS.map(({ icon: Icon, title, text }, i) => (
          <motion.li
            key={title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: (i % 3) * 0.06 }}
          >
            <div className="stitch mb-6" aria-hidden />
            <div className="mb-4 flex size-10 items-center justify-center rounded-lg border bg-card text-primary">
              <Icon className="size-5" />
            </div>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{text}</p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
