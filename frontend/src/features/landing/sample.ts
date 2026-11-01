/** Sample cloth for the landing-page demo: a generated woven texture, clean or with one planted defect. Pure and deterministic. */

export type SampleKind = "clean" | "hole" | "stain" | "tear";

export const SAMPLE_SIZE = 512;

export const SAMPLES: { kind: SampleKind; label: string; hint: string }[] = [
  { kind: "clean", label: "Clean cloth", hint: "A regular weave with no defects." },
  { kind: "hole", label: "Hole", hint: "A dark round hole." },
  { kind: "stain", label: "Stain", hint: "A pale irregular blotch." },
  { kind: "tear", label: "Tear", hint: "A dark slit across the weave." },
];

export interface SampleImage {
  width: number;
  height: number;
  /** RGBA, row by row. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

const WEAVE_CYCLES = 16; // a whole number of cycles across the picture
const MEAN = 128;
const AMPLITUDE = 50;
const TINT: [number, number, number] = [0.84, 0.94, 1.12]; // an indigo-ish cloth

/** Small seeded generator (mulberry32) so a sample looks the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number): number => Math.min(255, Math.max(0, v));

/** The gray level of the weave at (x, y), before any defect: a sinusoid across the picture plus fine noise. */
export function weaveLevel(x: number, size: number, noise: number): number {
  return MEAN + AMPLITUDE * Math.sin((2 * Math.PI * WEAVE_CYCLES * x) / size) + noise;
}

/** Defect geometry as fractions of the picture, so it scales with the size. */
export const DEFECTS = {
  hole: { cx: 0.64, cy: 0.33, r: 0.028 },
  stain: { cx: 0.34, cy: 0.66, r: 0.07 },
  tear: { y: 0.55, x0: 0.14, x1: 0.82, thickness: 0.012 },
} as const;

export function makeSample(kind: SampleKind, size = SAMPLE_SIZE, seed = 7): SampleImage {
  const rand = rng(seed);
  const data = new Uint8ClampedArray(size * size * 4);
  const blotch = rng(seed + 101); // irregular edge of the stain
  const edge = Array.from({ length: 64 }, () => 0.75 + 0.5 * blotch());

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let gray = weaveLevel(x, size, (rand() - 0.5) * 8);
      if (kind === "hole") {
        const d = DEFECTS.hole;
        if (Math.hypot(x - d.cx * size, y - d.cy * size) <= d.r * size) gray = 35;
      } else if (kind === "stain") {
        const d = DEFECTS.stain;
        const dx = x - d.cx * size;
        const dy = y - d.cy * size;
        const angle = Math.atan2(dy, dx);
        const reach = d.r * size * edge[Math.floor(((angle + Math.PI) / (2 * Math.PI)) * edge.length) % edge.length]!;
        const dist = Math.hypot(dx, dy);
        if (dist <= reach) gray += 70 * (1 - (0.45 * dist) / reach);
      } else if (kind === "tear") {
        const d = DEFECTS.tear;
        const t = Math.max(1, (d.thickness * size) / 2); // never thinner than two pixels
        if (x >= d.x0 * size && x <= d.x1 * size && Math.abs(y - d.y * size) <= t) gray = 28;
      }
      const i = (y * size + x) * 4;
      data[i] = clamp(gray * TINT[0]);
      data[i + 1] = clamp(gray * TINT[1]);
      data[i + 2] = clamp(gray * TINT[2]);
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}
