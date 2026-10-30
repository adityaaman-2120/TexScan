export type Coverage = "full" | "partial";

export interface SyllabusItem {
  id: string;
  topic: string;
  coverage: Coverage;
  /** What TexScan does with this topic, in plain words. */
  summary: string;
  /** The page where you can see it. */
  path: string;
  where: string;
  /** Backend module(s) that implement it. */
  code: string;
  /** Honest limit, shown when coverage is partial or the topic is used for display only. */
  note?: string;
}

/** The lab syllabus topics and where each lives in TexScan. Paths must exist in NAV_ITEMS (checked by a test). */
export const SYLLABUS: SyllabusItem[] = [
  {
    id: "read-image",
    topic: "Reading an image",
    coverage: "full",
    summary: "Files in any common format (PNG, JPEG, BMP, TIFF, WebP) are decoded, converted to grayscale with the luma weights 0.299 R + 0.587 G + 0.114 B and resized to a working size.",
    path: "/inspect",
    where: "Inspect: drop, paste or pick a sample",
    code: "pipeline/load.py, imageio.py",
  },
  {
    id: "noise",
    topic: "Noise",
    coverage: "full",
    summary: "Gaussian noise of a chosen strength can be added to any image to see when the verdict changes. The pipeline itself removes noise with a median or Gaussian filter.",
    path: "/robustness",
    where: "Robustness Lab: noise sweep",
    code: "robustness.py, pipeline/denoise.py",
  },
  {
    id: "histogram",
    topic: "Histogram",
    coverage: "full",
    summary: "The 256-bin gray-level histogram is shown before and after contrast enhancement, so you can see the levels being spread out.",
    path: "/inspect",
    where: "Inspect: Histogram card",
    code: "pipeline/enhance.py (histogram)",
  },
  {
    id: "edges",
    topic: "Edge detection",
    coverage: "full",
    summary: "Canny (gradient, non-maximum suppression, hysteresis) traces the outline of every detected defect region on the original image.",
    path: "/inspect",
    where: "Inspect: overlay type Edges",
    code: "pipeline/overlay.py",
    note: "Edges are used to draw the result. Defects themselves are found by thresholding, not by edges.",
  },
  {
    id: "registration",
    topic: "Rotation and translation (registration)",
    coverage: "full",
    summary: "The Golden template method lines up a known-good reference with the test image: ORB keypoints are matched and RANSAC fits a homography, which absorbs shifts, rotation and small scale changes.",
    path: "/arena",
    where: "Method Arena (add a reference image) or Inspect > Golden template; see the Aligned reference stage in the X-Ray",
    code: "pipeline/template.py",
  },
  {
    id: "bit-planes",
    topic: "Bit planes",
    coverage: "full",
    summary: "All eight bit planes of the grayscale image: plane k is bit k of every pixel. The high planes carry the structure, the low planes are mostly noise.",
    path: "/inspect",
    where: "Inspect: Advanced > Bit planes",
    code: "pipeline/bitplanes.py",
    note: "A viewer only; bit planes are not used for detection.",
  },
  {
    id: "enhancement",
    topic: "Image enhancement",
    coverage: "full",
    summary: "Histogram equalization or CLAHE (contrast-limited, per tile) before detection, with the clip limit and tile grid adjustable.",
    path: "/inspect",
    where: "Inspect: pipeline X-Ray, Contrast enhanced stage",
    code: "pipeline/enhance.py",
  },
  {
    id: "fft",
    topic: "Fourier transform",
    coverage: "full",
    summary: "The 2-D FFT gives a log-magnitude spectrum with the zero frequency at the centre. A periodic weave shows up as sharp peaks, which the FFT method finds and removes.",
    path: "/spectrum",
    where: "Spectrum Studio",
    code: "pipeline/spectrum.py, pipeline/notch.py",
  },
  {
    id: "spatial-filtering",
    topic: "Spatial smoothing and sharpening",
    coverage: "partial",
    summary: "Smoothing is covered: a Gaussian (linear) or median (non-linear) filter over a k x k window. Local mean and variance windows are also used as a texture measure.",
    path: "/inspect",
    where: "Inspect > Advanced (denoise kernel size) and the Local statistics method",
    code: "pipeline/denoise.py, pipeline/local_stats.py",
    note: "There is no spatial-domain sharpening filter (unsharp mask, Laplacian). Sharpening is done in the frequency domain, below.",
  },
  {
    id: "frequency-filtering",
    topic: "Frequency-domain smoothing and sharpening",
    coverage: "full",
    summary: "Low-pass (smoothing), high-pass and sharpen (1 + boost x high-pass) filters with an ideal, Butterworth or Gaussian response, applied to the spectrum with a live preview.",
    path: "/spectrum",
    where: "Spectrum Studio: Low / high-pass presets",
    code: "pipeline/notch.py (radial_filter)",
  },
  {
    id: "compression",
    topic: "Image compression",
    coverage: "full",
    summary: "JPEG compression at a range of qualities: file size, compression ratio, PSNR and SSIM against the original, and whether the verdict survives.",
    path: "/robustness",
    where: "Robustness Lab: JPEG quality",
    code: "robustness.py",
  },
  {
    id: "morphology",
    topic: "Morphology",
    coverage: "full",
    summary: "The raw defect mask is opened (erode, dilate) to remove specks and closed (dilate, erode) to fill gaps with an elliptical element; small connected components are then dropped.",
    path: "/inspect",
    where: "Inspect: X-Ray, Raw defect mask and Cleaned mask",
    code: "pipeline/segment.py",
  },
  {
    id: "restoration",
    topic: "Image restoration",
    coverage: "full",
    summary: "Periodic interference is removed with a notch filter: Gaussian notches at the detected spectral peaks (and any you draw) are multiplied out and the image is transformed back. What remains is the defect.",
    path: "/spectrum",
    where: "Spectrum Studio: draw a notch, then see the residual",
    code: "pipeline/notch.py",
    note: "Restoration here removes a known periodic pattern. There is no deblurring or inverse filtering.",
  },
];

export function coverageCounts(items: SyllabusItem[]): { full: number; partial: number; total: number } {
  const full = items.filter((i) => i.coverage === "full").length;
  return { full, partial: items.length - full, total: items.length };
}
