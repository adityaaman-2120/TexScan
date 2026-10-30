import type { LiveStatus } from "./useLiveStream";

export type VerdictKind = "pass" | "fail" | "paused" | "connecting" | "waiting" | "offline" | "error" | "off";

export interface VerdictView {
  kind: VerdictKind;
  /** big text shown in the indicator */
  label: string;
  /** one line of context under it */
  detail: string;
}

interface Input {
  cameraReady: boolean;
  paused: boolean;
  status: LiveStatus;
  decision: "PASS" | "FAIL" | null;
  /** true when no fresh result has arrived recently */
  stale: boolean;
  defectCount: number;
  serverMessage: string | null;
}

/** What the big indicator should say right now. Connection problems outrank a stale verdict; a fresh verdict outranks nothing else. */
export function verdictView({ cameraReady, paused, status, decision, stale, defectCount, serverMessage }: Input): VerdictView {
  if (!cameraReady) return { kind: "off", label: "CAMERA OFF", detail: "Start the camera to begin." };
  if (paused) return { kind: "paused", label: "PAUSED", detail: decision ? `Last result: ${decision}.` : "Frame frozen, nothing is being sent." };
  if (status === "error") return { kind: "error", label: "REJECTED", detail: serverMessage ?? "The server rejected the live settings." };
  if (status === "offline") return { kind: "offline", label: "OFFLINE", detail: "Could not reach the server. Check that the backend is running." };
  if (status === "connecting" || status === "reconnecting") return { kind: "connecting", label: status === "connecting" ? "CONNECTING" : "RECONNECTING", detail: "Opening the live connection…" };
  if (decision === null || stale) return { kind: "waiting", label: "WAITING", detail: "Waiting for the first result." };
  return decision === "PASS"
    ? { kind: "pass", label: "PASS", detail: "No defects found." }
    : { kind: "fail", label: "FAIL", detail: `${defectCount} ${defectCount === 1 ? "defect" : "defects"} found.` };
}
