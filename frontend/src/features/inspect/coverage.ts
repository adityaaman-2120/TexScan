import { formatShare } from "./operator";

export interface CoverageInput {
  center_fraction: number;
  max_side: number;
  morphology: { min_area: number };
}

export interface Coverage {
  /** What part of the picture was checked, e.g. "the middle 60% of the picture". */
  region: string;
  /** The smallest defect that counts, as a share of the checked area, e.g. "0.5%". null when the area is unknown. */
  smallest: string | null;
  /** Things this check cannot see, in plain words. Empty when nothing notable. */
  limits: string[];
}

/** A defect smaller than this share of the checked picture is called small. Above it, tiny holes and spots can pass unseen. */
export const SMALL_DEFECT_SHARE = 0.25;
/** A picture shrunk to this many pixels or fewer on its long side loses small defects. */
export const SHRUNK_AT = 400;

/** What a result did and did not look at, from the settings it ran with and the size of the picture it checked. */
export function coverageOf(config: CoverageInput, checkedWidth: number, checkedHeight: number): Coverage {
  const centre = config.center_fraction < 1 - 1e-9;
  const area = checkedWidth * checkedHeight;
  const share = area > 0 ? (config.morphology.min_area / area) * 100 : null;
  const limits: string[] = [];
  if (centre) limits.push("Everything outside it, including the edges, was not checked.");
  if (share !== null && share >= SMALL_DEFECT_SHARE) limits.push(`Defects smaller than about ${formatShare(share)} of the checked area are ignored, so small holes and spots can pass.`);
  if (config.max_side <= SHRUNK_AT) limits.push(`The picture was shrunk to ${config.max_side} px, which makes small defects smaller still.`);
  return {
    region: centre ? `the middle ${Math.round(config.center_fraction * 100)}% of the picture` : "the whole picture",
    smallest: share === null ? null : formatShare(share),
    limits,
  };
}

/** What a profile does to every picture before judging it, for the place where it is chosen. Empty when it checks the whole picture at full size. */
export function profileNotes(config: Pick<CoverageInput, "center_fraction" | "max_side">): string[] {
  const notes: string[] = [];
  if (config.center_fraction < 1 - 1e-9) notes.push(`Checks only the middle ${Math.round(config.center_fraction * 100)}% of each picture. The edges are skipped, so a defect near the edge is not seen.`);
  if (config.max_side <= SHRUNK_AT) notes.push(`Shrinks each picture to ${config.max_side} px, so small defects get smaller.`);
  return notes;
}
