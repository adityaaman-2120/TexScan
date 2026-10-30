import type { Method } from "@/api/types";

export interface SampleImage {
  id: string;
  title: string;
  description: string;
  url: string;
  /** a known-good image of the same material, used when the golden-template method is chosen */
  reference: string;
  /** ground-truth mask (white = defect; all black for the clean samples) for the Method Arena */
  mask: string;
  /** the method that shows this sample best (measured; see backend/scripts/make_samples.py) */
  method: Method;
  defective: boolean;
}

const sample = (id: string, title: string, description: string, ref: string, method: Method, defective: boolean): SampleImage => ({
  id,
  title,
  description,
  url: `/samples/${id}.png`,
  mask: `/samples/${id}.mask.png`,
  reference: `/samples/${ref}.png`,
  method,
  defective,
});

/** Synthetic textures with planted defects: not photographs of real cloth. */
export const SAMPLES: SampleImage[] = [
  sample("weave-clean", "Weave, clean", "Periodic weave with no defects.", "ref-weave", "fft", false),
  sample("weave-hole", "Weave, hole", "Dark round hole in a periodic weave. Local statistics types it most cleanly.", "ref-weave", "local_statistics", true),
  sample("weave-scratch", "Weave, scratch", "Thin bright scratch across a weave.", "ref-weave", "fft", true),
  sample("plaid-clean", "Plaid, clean", "Two-direction periodic pattern, no defects.", "ref-plaid", "fft", false),
  sample("plaid-stain", "Plaid, stain", "Irregular light blotch on plaid.", "ref-plaid", "gabor", true),
  sample("cloth-tear", "Noisy cloth, tear", "Uneven lighting and sensor noise with a dark slit.", "ref-cloth", "gabor", true),
  sample("leather-hole", "Leather grain, hole", "Non-periodic grain: FFT struggles here, try Gabor or Local statistics.", "ref-leather", "local_statistics", true),
];
