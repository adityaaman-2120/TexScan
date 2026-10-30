import { Info } from "lucide-react";

/** Exactly three sentences, switching with what the user is doing. */
const NOTCH_TEXT = [
  "The right-hand picture is the image's frequency spectrum: each bright dot is a pattern that repeats across the image, and the centre is its average brightness.",
  "Circled peaks and anything you paint are rejected (red areas), so the residual shows what is left once the repeating texture has been removed.",
  "Defects stand out in the residual and the defect mask because, unlike the texture, they do not repeat.",
] as const;

const PRESET_TEXT = [
  "The blue shading on the spectrum marks the frequencies the filter removes: near the centre are slow changes, far from it are fast ones such as edges and noise.",
  "A low-pass filter keeps only the slow changes (smoothing), a high-pass keeps only the fast ones (edges), and sharpen adds those edges back on top of the image.",
  "The defect mask is computed from the filtered picture in the usual way, so a plain low- or high-pass leaves the repeating texture in and will often flag it.",
] as const;

export function InfoPanel({ presetActive }: { presetActive: boolean }) {
  const sentences = presetActive ? PRESET_TEXT : NOTCH_TEXT;
  return (
    <aside aria-label="What you are looking at" className="flex gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <Info className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="text-[13px] leading-relaxed text-muted-foreground">{sentences.join(" ")}</p>
    </aside>
  );
}
