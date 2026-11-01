import { motion } from "framer-motion";

const LINES = [
  { n: "01", head: "By eye.", body: "A roll is checked a stretch at a time. Careful inspection takes hours, and tired eyes miss things." },
  { n: "02", head: "By whoever is on shift.", body: "Two inspectors, one roll, rarely the same score. The verdict depends on who happened to be there." },
  { n: "03", head: "Out of budget.", body: "Machine-vision systems would fix this, but they are priced for large mills, not for a small unit." },
];

/** The problem, stated plainly and set large. */
export function Manifesto() {
  return (
    <section aria-labelledby="problem-title" className="mx-auto max-w-[1680px] px-4 py-14 sm:px-6 lg:px-12 sm:py-20">
      <p id="problem-title" className="mb-10 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        How a small unit checks fabric today
      </p>
      <ol>
        {LINES.map((l, i) => (
          <motion.li
            key={l.n}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: i * 0.05, ease: [0.2, 0.7, 0.2, 1] }}
            className="group"
          >
            <div className="stitch" aria-hidden />
            <div className="grid items-baseline gap-x-8 gap-y-3 py-7 sm:py-9 md:grid-cols-[3rem_minmax(0,1.5fr)_minmax(0,1fr)]">
              <span className="font-mono text-xs text-muted-foreground transition-colors group-hover:text-primary">{l.n}</span>
              <h2 className="font-display text-[clamp(2.1rem,4.6vw,4.8rem)] leading-[1] transition-transform duration-500 group-hover:translate-x-2">{l.head}</h2>
              <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">{l.body}</p>
            </div>
          </motion.li>
        ))}
        <li aria-hidden>
          <div className="stitch" />
        </li>
      </ol>
      <p className="mt-10 max-w-2xl font-display text-2xl leading-snug sm:text-3xl xl:text-4xl">
        There is a cheaper way to look: <em className="text-primary">a computer, a camera and software</em> that does the looking the same way every time.
      </p>
    </section>
  );
}
