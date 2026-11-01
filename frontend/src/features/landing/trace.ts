export interface TraceStep {
  id: string;
  name: string;
  formula: string;
  why: string;
}

/**
 * The steps of an inspection of a woven (repeating) fabric, with the formula and the plain-English reason the app's own
 * Pipeline X-Ray shows for each (the text mirrors features/inspect/stageInfo.ts).
 */
export const TRACE: TraceStep[] = [
  { id: "gray", name: "Grayscale", formula: "Y = 0.299 R + 0.587 G + 0.114 B", why: "Colour is collapsed into a single brightness channel; texture defects live in brightness." },
  { id: "denoise", name: "Denoise", formula: "out(x) = median{ in(x + d) : d ∈ k×k window }", why: "Every pixel becomes the median of its neighbours, which removes speckle but keeps edges sharp." },
  { id: "contrast", name: "Contrast", formula: "k′ = 255 · CDF_tile(k),  histogram clipped at the limit", why: "Contrast is boosted locally, tile by tile, with a cap so noise is not blown up." },
  { id: "spectrum", name: "Spectrum", formula: "F = fftshift(FFT2((I − mean) · hann))", why: "The image seen as waves: bright dots are repeating patterns, which is the weave." },
  { id: "notch", name: "Remove the weave", formula: "H(u, v) = Π (1 − exp(−d² / 2σ²))", why: "A filter that blocks exactly the weave's frequencies and lets everything else through." },
  { id: "deviation", name: "Deviation", formula: "m = G_σ ∗ |r − median(r)|", why: "How far each pixel sits from the typical level, softly blurred; bright means suspicious." },
  { id: "threshold", name: "Threshold", formula: "mask = m > max(T_otsu, T_min)", why: "Everything brighter than an automatically chosen cut-off is marked as a possible defect." },
  { id: "clean", name: "Clean up", formula: "close(open(mask, B)),  drop components < min_area", why: "Specks are removed, small gaps are filled, and regions that are too small are dropped." },
  { id: "outline", name: "Outline", formula: "Canny(mask) painted over I", why: "The outline of every remaining defect region is drawn on your image." },
];
