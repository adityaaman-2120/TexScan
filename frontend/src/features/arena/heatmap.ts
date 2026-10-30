import type { BenchmarkOut, CategoryMetrics, Method } from "@/api/types";

export type MetricKey = "f1" | "accuracy" | "precision" | "recall" | "pixel_iou" | "pixel_dice" | "seconds_per_image";

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** what the number measures, one line */
  help: string;
  higherIsBetter: boolean;
}

export const METRICS: MetricDef[] = [
  { key: "f1", label: "F1", help: "Image level: does the method call defective images defective? Harmonic mean of precision and recall.", higherIsBetter: true },
  { key: "accuracy", label: "Accuracy", help: "Image level: share of images judged correctly.", higherIsBetter: true },
  { key: "recall", label: "Recall", help: "Image level: share of defective images that were caught.", higherIsBetter: true },
  { key: "precision", label: "Precision", help: "Image level: share of FAIL verdicts that were right.", higherIsBetter: true },
  { key: "pixel_iou", label: "Pixel IoU", help: "Pixel level, defective images only: overlap with the ground-truth mask.", higherIsBetter: true },
  { key: "pixel_dice", label: "Pixel Dice", help: "Pixel level, defective images only: 2 x overlap / (predicted + true area).", higherIsBetter: true },
  { key: "seconds_per_image", label: "Time", help: "Average seconds per image (lower is better).", higherIsBetter: false },
];

const METHOD_ORDER: Method[] = ["fft", "gabor", "golden_template", "local_statistics"];
const CATEGORY_ORDER = ["carpet", "grid", "leather", "tile", "wood"];

export interface Cell {
  method: string;
  category: string;
  /** the metric's value, or null when it does not exist (e.g. pixel IoU without a defective image) */
  value: number | null;
  metrics: CategoryMetrics | null;
}

export interface Grid {
  methods: string[];
  categories: string[];
  cells: Cell[][]; // [method][category]
  /** average over categories that have a value, per method */
  means: (number | null)[];
  /** the largest value on the grid (for the time scale) */
  max: number;
}

const rank = (order: string[]) => (a: string, b: string) => {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
};

export function buildGrid(results: BenchmarkOut["results"], metric: MetricKey): Grid {
  const methods = Object.keys(results).sort(rank(METHOD_ORDER));
  const categories = [...new Set(methods.flatMap((m) => Object.keys(results[m]!)))].sort(rank(CATEGORY_ORDER));
  const cells = methods.map((method) =>
    categories.map((category): Cell => {
      const metrics = results[method]?.[category] ?? null;
      return { method, category, metrics, value: metrics ? (metrics[metric] ?? null) : null };
    }),
  );
  const means = cells.map((row) => {
    const values = row.map((c) => c.value).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
  const all = [...cells.flat().map((c) => c.value), ...means].filter((v): v is number => v !== null);
  return { methods, categories, cells, means, max: all.length ? Math.max(...all) : 1 };
}

/** 0..1 where 1 is "best": scores are already in [0, 1]; time is scaled by the slowest cell and flipped. */
export function intensity(value: number | null, metric: MetricDef, max: number): number {
  if (value === null) return 0;
  if (metric.higherIsBetter) return Math.min(1, Math.max(0, value));
  return max > 0 ? Math.min(1, Math.max(0, 1 - value / max)) : 1;
}

/** Row index of the best value in each column (ties share the best), for outlining winners. */
export function bestPerColumn(grid: Grid, metric: MetricDef): Set<string> {
  const winners = new Set<string>();
  grid.categories.forEach((category, c) => {
    const values = grid.cells.map((row) => row[c]!.value);
    const present = values.filter((v): v is number => v !== null);
    if (present.length < 2) return; // a single entry is not a comparison
    const best = metric.higherIsBetter ? Math.max(...present) : Math.min(...present);
    values.forEach((v, r) => v === best && winners.add(`${grid.methods[r]}|${category}`));
  });
  return winners;
}

export function formatValue(value: number | null, metric: MetricDef): string {
  if (value === null) return "n/a";
  return metric.key === "seconds_per_image" ? (value < 10 ? value.toFixed(2) : value.toFixed(1)) : value.toFixed(2);
}
