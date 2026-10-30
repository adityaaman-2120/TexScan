import createClient from "openapi-fetch";
import { ApiError, failureMessage, NETWORK_MESSAGE } from "./errors";
import type { paths } from "./schema";

/**
 * Typed client: every path, parameter and response body comes from the generated OpenAPI types
 * (`npm run gen:api`, or `make api-types` to also re-export the schema from the backend).
 * In dev, Vite proxies /api to the FastAPI server.
 */
export const API_BASE = "/api";
export const client = createClient<paths>({ baseUrl: API_BASE });

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Turn an openapi-fetch result into the data, or throw an ApiError with a readable message. */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await request;
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }
  if (!result.response.ok) {
    const detail = (result.error as { detail?: unknown } | undefined)?.detail;
    throw new ApiError(result.response.status, failureMessage(result.response.status, detail, result.response.statusText));
  }
  return result.data as T; // undefined for 204 responses
}

/** multipart/form-data POST (openapi-fetch cannot build file uploads); the response type comes from the caller. */
export async function postForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: "POST", body: form, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error; // caller cancelled on purpose
    throw new ApiError(0, NETWORK_MESSAGE);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new ApiError(response.status, failureMessage(response.status, body?.detail, response.statusText));
  }
  return (await response.json()) as T;
}

/** Stage images are served at server-relative /files/... URLs; the browser reaches them through the proxy. */
export const fileUrl = (serverPath: string): string => `${API_BASE}${serverPath}`;

export const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";
