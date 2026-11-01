/** Sample cloth for the landing-page demo: four crops of one real photograph of damaged fabric, one defect each (or none). */

export type SampleKind = "clean" | "hole" | "stain" | "tear";

export const SAMPLE_SIZE = 512;

export const SAMPLES: { kind: SampleKind; label: string; hint: string; src: string }[] = [
  { kind: "clean", label: "Clean cloth", hint: "Plain fabric with no defects.", src: "/samples/clean.jpg" },
  { kind: "hole", label: "Hole", hint: "Frayed hole beside a seam.", src: "/samples/hole.jpg" },
  { kind: "stain", label: "Stain", hint: "A pale patch on the cloth.", src: "/samples/stain.jpg" },
  { kind: "tear", label: "Tear", hint: "A small slit in the weave.", src: "/samples/tear.jpg" },
];

/**
 * The settings the demo inspects with. Real cloth is textured, so the plain defaults raise false alarms on it; these are
 * tuned on these four pictures (local statistics, a higher cut-off, small specks ignored).
 */
export const DEMO_METHOD = "local_statistics";
export const DEMO_CONFIG = { max_side: SAMPLE_SIZE, local_stats: { k: 5 }, morphology: { min_area: 300 } } as const;

const loaded = new Map<SampleKind, Promise<HTMLImageElement>>();

/** The picture for a sample, fetched once and reused. */
export function loadSample(kind: SampleKind): Promise<HTMLImageElement> {
  let p = loaded.get(kind);
  if (!p) {
    const src = SAMPLES.find((s) => s.kind === kind)!.src;
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        loaded.delete(kind); // let a later try fetch it again
        reject(new Error("Could not load the sample picture."));
      };
      img.src = src;
    });
    loaded.set(kind, p);
  }
  return p;
}
