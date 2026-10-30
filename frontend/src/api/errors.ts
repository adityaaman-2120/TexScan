export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const NETWORK_MESSAGE = "Cannot reach the TexScan API. Is the backend running on port 8000?";

/** The dev proxy (and any reverse proxy) answers these when the backend behind it is down. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** True when the server could not be reached at all (no response, or a proxy saying the backend is down). */
export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || (GATEWAY_STATUSES.has(error.status) && error.message === NETWORK_MESSAGE));
}

/** Message for a failed response. A gateway error without a message from our API means the backend is not running. */
export function failureMessage(status: number, detail: unknown, statusText: string): string {
  if (GATEWAY_STATUSES.has(status) && typeof detail !== "string" && !Array.isArray(detail)) return NETWORK_MESSAGE;
  return detailMessage(detail, statusText);
}

interface ValidationItem {
  loc?: unknown[];
  msg?: string;
}

/** FastAPI sends `detail` as a string for our errors and as a list of {loc, msg} for schema validation errors. */
export function detailMessage(detail: unknown, fallback = "Request failed"): string {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return (detail as ValidationItem[])
      .map((d) => {
        const field = (d.loc ?? []).filter((p) => p !== "body" && p !== "query").join(".");
        return field ? `${field}: ${d.msg ?? "invalid"}` : (d.msg ?? "invalid");
      })
      .join("; ");
  }
  return fallback;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong";
}
