import { Plus } from "lucide-react";

const QUESTIONS = [
  {
    q: "What do I need to run it?",
    a: "A computer and a camera: a webcam, or a phone on the same Wi-Fi. You also print one calibration marker, which TexScan makes for you as a PDF.",
  },
  {
    q: "Does it need the internet?",
    a: "No. TexScan runs on your own computer and keeps its data there. Nothing is uploaded anywhere.",
  },
  {
    q: "Which fabrics does it work on?",
    a: "It works best on fabrics with a regular, even texture, set up once per fabric from a few clean pictures. Strongly patterned or very uneven cloth needs more careful setup. Compare its verdicts with your own inspectors on a few rolls before you rely on it.",
  },
  {
    q: "How accurate are the measurements?",
    a: "They depend on the calibration and on keeping the camera at the distance you calibrated at. Check a few defects against a ruler on your own fabric before you trust the numbers.",
  },
  {
    q: "Does the grading follow the ASTM four-point standard?",
    a: "It implements the four-point system as it is publicly described for ASTM D5430. The rules are written down, and the hole rule and the acceptance limit are settings, because buyers differ. Check them against your copy of the standard or your buyer's specification.",
  },
  {
    q: "Is it artificial intelligence?",
    a: "No. It uses classical image processing with no trained model and no hidden weights, which is why every step can be shown and explained.",
  },
];

/** Plain questions, plain answers, including the limits. Native disclosure elements: keyboard and screen-reader friendly. */
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-[1680px] scroll-mt-16 px-4 py-14 sm:px-6 lg:px-12 sm:py-20">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">Questions</p>
          <h2 id="faq-title" className="font-display text-[clamp(2.4rem,4.4vw,4.8rem)] leading-[1]">
            Straight <em>answers.</em>
          </h2>
          <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-muted-foreground">Including what it cannot do yet.</p>
        </div>
        <div className="border-t">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group border-b">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[17px] font-medium outline-none transition-colors marker:hidden hover:text-primary focus-visible:text-primary [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45" aria-hidden />
              </summary>
              <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
