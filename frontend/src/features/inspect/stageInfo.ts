import type { InspectionOut } from "@/api/types";

type Config = InspectionOut["config"];

export interface StageInfo {
  title: string;
  /** one plain-English sentence */
  explain: string;
  formula: string;
  /** key in the response's timings_ms that produced this image, if any */
  timing?: string;
}

const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function denoiseInfo(c: Config): Pick<StageInfo, "explain" | "formula"> {
  const k = c.denoise.ksize;
  if (c.denoise.method === "none") return { explain: "Denoising is switched off, so this is the grayscale image unchanged.", formula: "out = in" };
  if (c.denoise.method === "gaussian")
    return { explain: `A gentle blur over a ${k}×${k} window smooths away fine noise (and a little detail).`, formula: "out = in ∗ G_σ   (σ from the kernel size)" };
  return {
    explain: `Every pixel becomes the median of its ${k}×${k} neighbours, which removes speckle but keeps edges sharp.`,
    formula: "out(x) = median{ in(x + d) : d ∈ k×k window }",
  };
}

function enhanceInfo(c: Config): Pick<StageInfo, "explain" | "formula"> {
  if (c.enhance.method === "none") return { explain: "Contrast enhancement is switched off.", formula: "out = in" };
  if (c.enhance.method === "hist_eq")
    return { explain: "Brightness levels are spread out so the whole range from black to white is used.", formula: "k′ = 255 · CDF(k)" };
  return {
    explain: `Contrast is boosted locally, tile by tile (${c.enhance.tile_grid}×${c.enhance.tile_grid}), with a cap of ${num(c.enhance.clip_limit)} so noise is not blown up.`,
    formula: "k′ = 255 · CDF_tile(k),  histogram clipped at the limit",
  };
}

function rawMaskInfo(c: Config): Pick<StageInfo, "explain" | "formula"> {
  if (c.method === "gabor")
    return {
      explain: `A pixel is marked when any filter's energy is more than ${num(c.gabor.k)} robust deviations away from the image's typical value.`,
      formula: "max_f |z_f| > k,   z = (E − median) / (1.4826 · MAD)",
    };
  if (c.method === "local_statistics")
    return {
      explain: `A pixel is marked when its ${c.local_stats.window}×${c.local_stats.window} window's brightness or texture is an outlier (more than ${num(c.local_stats.k)} robust deviations).`,
      formula: "max(|z_mean|, |z_log var|) > k",
    };
  return {
    explain: `Everything brighter than a cut-off is marked as a possible defect; the cut-off is chosen automatically (Otsu) but never below ${num(c.threshold.min_threshold)}.`,
    formula: "mask = m > max(T_otsu, T_min)",
  };
}

function scoreInfo(c: Config): Pick<StageInfo, "explain" | "formula"> {
  return c.method === "local_statistics"
    ? { explain: "How unusual each window is compared with the rest of the image; bright means unusual.", formula: "score = max(|z_mean|, |z_log var|)" }
    : { explain: "How unusual the texture energy is at each pixel, taking the most unusual filter; bright means unusual.", formula: "score = max_f |(E_f − median) / (1.4826 · MAD)|" };
}

/** Plain-English explanation and formula for a stage image, specialised with the settings the run used. */
export function stageInfo(name: string, c: Config): StageInfo {
  switch (name) {
    case "upload":
      return { title: "Your upload", explain: "The file exactly as you sent it, before anything touches it.", formula: "I(x, y)" };
    case "original":
      return {
        title: "Resized original",
        explain: `Scaled so the longest side is ${c.max_side} px (proportions kept), so every image is processed at the same scale.`,
        formula: `s = ${c.max_side} / max(H, W)`,
        timing: "load_and_normalize",
      };
    case "gray":
      return { title: "Grayscale", explain: "Colour is collapsed into a single brightness channel; texture defects live in brightness.", formula: "Y = 0.299 R + 0.587 G + 0.114 B", timing: "load_and_normalize" };
    case "denoised":
      return { title: "Denoised", ...denoiseInfo(c), timing: "denoise" };
    case "enhanced":
      return { title: "Contrast enhanced", ...enhanceInfo(c), timing: "enhance" };
    case "spectrum":
      return {
        title: "Frequency spectrum",
        explain: "The image seen as waves: bright dots are repeating patterns (the weave), and the centre is the average brightness.",
        formula: "F = fftshift(FFT2((I − mean) · hann)),  shown as log(1 + |F|)",
        timing: "fft_spectrum",
      };
    case "spectrum_peaks":
      return {
        title: "Detected peaks",
        explain: "Strong, sharp spots in the spectrum are the repeating pattern; they are circled so they can be removed.",
        formula: "peak = local max of log(1 + |F|) above mean + k · σ",
        timing: "detect_peaks",
      };
    case "notch_mask":
      return {
        title: "Notch filter",
        explain: "A filter that blocks exactly the circled frequencies (and their mirror images) and lets everything else through.",
        formula: "H(u, v) = Π (1 − exp(−d² / 2σ²))",
        timing: "notch_filter",
      };
    case "residual":
      return {
        title: "Residual",
        explain: "The image with the repeating pattern removed; what is left is irregular: noise and defects.",
        formula: "g = IFFT2(ifftshift(F · H))",
        timing: "notch_filter",
      };
    case "residual_abs":
      return {
        title: "Deviation map",
        explain: "How far each pixel sits from the typical level, softly blurred; bright means suspicious.",
        formula: "m = G_σ ∗ |r − median(r)|",
        timing: "residual_to_mask",
      };
    case "gabor_energy":
      return {
        title: "Gabor energy",
        explain: "Average strength of the texture at several scales and directions (12 filters); defects change it.",
        formula: "E = G ∗ √((I∗g_even)² + (I∗g_odd)²)",
        timing: "gabor_energy",
      };
    case "anomaly_score":
      return { title: "Anomaly score", ...scoreInfo(c), timing: c.method === "gabor" ? "gabor_score" : "local_stats_score" };
    case "aligned_reference":
      return {
        title: "Aligned reference",
        explain: "The known-good image, warped to line up with yours using matched feature points.",
        formula: "p_test ≈ H · p_ref   (ORB features + RANSAC)",
        timing: "align_template",
      };
    case "difference":
      return {
        title: "Difference",
        explain: "Pixel-by-pixel difference between your image and the aligned reference, ignoring overall brightness.",
        formula: "D = |(T − mean T) − (R − mean R)|",
        timing: "abs_difference",
      };
    case "local_mean":
      return { title: "Local mean", explain: "Average brightness in a sliding window.", formula: "μ = box_w(I)", timing: "local_mean_var" };
    case "local_variance":
      return { title: "Local variance", explain: "How much the brightness varies inside each window (shown on a log scale).", formula: "σ² = box_w(I²) − μ²", timing: "local_mean_var" };
    case "mask_raw":
      return { title: "Raw defect mask", ...rawMaskInfo(c), timing: c.method === "gabor" || c.method === "local_statistics" ? "flag_outliers" : "residual_to_mask" };
    case "mask_colour":
      return {
        title: "Colour mask",
        explain: "Regions whose colour differs from the cloth around them: a stain, a burn, or a hole showing what is underneath. Brightness counts little, so stripes do not. It is joined with the texture mask before cleanup.",
        formula: "d = ‖(0.25·ΔL, Δa, Δb)‖ > median + max(k·MAD, floor)",
        timing: "colour_mask",
      };
    case "mask_clean":
      return {
        title: "Cleaned mask",
        explain: `Specks are removed, small gaps are filled, and regions under ${c.morphology.min_area} px are dropped.`,
        formula: "close(open(mask, B)),  drop components < min_area",
        timing: "morphology_cleanup",
      };
    case "overlay":
      return {
        title: "Result overlay",
        explain: "The outline of every remaining defect region drawn in red on your image.",
        formula: "Canny(mask) painted over I",
        timing: "edges_overlay",
      };
    default:
      return { title: name.replace(/_/g, " "), explain: "An intermediate image produced by the pipeline.", formula: "—" };
  }
}

/** Preferred stage for the "residual" side of the comparison slider. */
const RESIDUAL_KEYS = ["residual", "difference", "anomaly_score", "residual_abs", "local_variance"] as const;
/** Preferred stage for the heatmap overlay (a score map where bright = suspicious). */
const HEAT_KEYS = ["residual_abs", "anomaly_score", "difference"] as const;

export function pickStage(urls: Record<string, string>, keys: readonly string[]): string | undefined {
  return keys.find((k) => k in urls);
}

export const residualKey = (urls: Record<string, string>): string | undefined => pickStage(urls, RESIDUAL_KEYS);
export const heatKey = (urls: Record<string, string>): string | undefined => pickStage(urls, HEAT_KEYS);
