import { API_BASE } from "@/api/client";

export const MIN_MARKER_MM = 10;
export const MAX_MARKER_MM = 150;
export const DEFAULT_MARKER_MM = 50;

/** The printed side typed by the user as a number in range, or null. */
export function parseMarkerSide(value: string): number | null {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n >= MIN_MARKER_MM && n <= MAX_MARKER_MM ? n : null;
}

export function markerPdfUrl(sideMm: number): string {
  return `${API_BASE}/calibration/marker.pdf?side_mm=${encodeURIComponent(String(sideMm))}`;
}
