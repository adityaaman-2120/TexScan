export const CALIBRATION_FRAMES = 12; // the server needs 5 to 20 good images; more frames means more of the natural variation is learned
export const CALIBRATION_GAP_MS = 350; // time between frames, so there is a little natural movement between them

/** Name of the profile made by a calibration, e.g. "Live camera 2026-10-31 14:05". */
export function calibrationName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `Live camera ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
}
