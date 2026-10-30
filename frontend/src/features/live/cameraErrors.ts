export type CameraProblem = "insecure" | "unsupported" | "denied" | "nocamera" | "busy" | "constraints" | "error";

export interface CameraFailure {
  problem: CameraProblem;
  title: string;
  /** what to do about it, in plain words */
  help: string;
}

/** getUserMedia only exists on secure pages (HTTPS or localhost). */
export function checkSupport(env: { isSecureContext: boolean; hasMediaDevices: boolean }): CameraFailure | null {
  if (env.hasMediaDevices) return null;
  return env.isSecureContext
    ? { problem: "unsupported", title: "This browser cannot access a camera", help: "Try a current version of Chrome, Edge, Firefox or Safari." }
    : {
        problem: "insecure",
        title: "The camera needs a secure (HTTPS) page",
        help: "Browsers only allow camera access on https:// pages or on localhost. Start the app with `make dev-lan` (or `.\\dev.ps1 -Lan`) and open its https:// address.",
      };
}

/** Turn whatever getUserMedia threw into something a person can act on. */
export function describeCameraError(error: unknown): CameraFailure {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return {
        problem: "denied",
        title: "Camera access was blocked",
        help: "Allow the camera for this site: click the camera or lock icon in the address bar, set Camera to Allow, then press Try again. On a phone, check the browser's site settings.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return { problem: "nocamera", title: "No camera was found", help: "Connect a webcam, or open this page on a phone. You can still inspect a photo on the Inspect page." };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return { problem: "busy", title: "The camera is in use", help: "Another app or browser tab is using the camera. Close it and press Try again." };
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return { problem: "constraints", title: "That camera cannot do the requested format", help: "Pick another camera from the list, or press Try again to use the default." };
    default:
      return { problem: "error", title: "The camera could not be started", help: error instanceof Error && error.message ? error.message : "Press Try again." };
  }
}
