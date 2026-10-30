import type { Defect } from "@/api/types";

export type DefectKind = NonNullable<Defect["defect_type"]>;

export const DEFECT_LABELS: Record<DefectKind, string> = {
  hole: "Hole",
  tear_line: "Tear / line",
  stain: "Stain",
  thread_fiber: "Thread / fiber",
  unknown: "Unknown",
};
