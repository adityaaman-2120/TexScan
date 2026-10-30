export interface Histogram {
  edges: number[];
  counts: number[];
  clipped: boolean;
}

export interface Bin {
  lo: number;
  hi: number;
  mid: number;
  count: number;
}

export function toBins(h: Histogram): Bin[] {
  return h.counts.map((count, i) => ({ lo: h.edges[i]!, hi: h.edges[i + 1]!, mid: (h.edges[i]! + h.edges[i + 1]!) / 2, count }));
}

/** Fraction of the samples whose score is above `threshold`, assuming scores are spread evenly inside each bin. */
export function shareAbove(h: Histogram, threshold: number): number {
  const total = h.counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let above = 0;
  for (const { lo, hi, count } of toBins(h)) {
    above += count * Math.min(1, Math.max(0, (hi - threshold) / (hi - lo)));
  }
  return above / total;
}

/** "0.31%", "<0.01%" or "0%": a share formatted for small values. */
export function formatShare(share: number): string {
  if (share === 0) return "0%";
  const pct = share * 100;
  return pct < 0.01 ? "<0.01%" : pct < 1 ? `${pct.toFixed(2)}%` : `${pct.toFixed(1)}%`;
}
