import { API_BASE } from "@/api/client";
import { ApiError, failureMessage, NETWORK_MESSAGE } from "@/api/errors";

/** What a PDF report is about: one inspection, or every inspection of one batch. */
export type ReportTarget = { kind: "inspection"; id: number } | { kind: "batch"; id: string };

export function reportUrl(target: ReportTarget): string {
  const path = target.kind === "inspection" ? `/inspections/${target.id}/report.pdf` : `/batches/${encodeURIComponent(target.id)}/report.pdf`;
  return `${API_BASE}${path}`;
}

/** Name used when the server's Content-Disposition cannot be read. */
export function fallbackReportName(target: ReportTarget): string {
  return target.kind === "inspection" ? `texscan-inspection-${target.id}.pdf` : `texscan-batch-${target.id.slice(0, 8)}.pdf`;
}

/** File name from a Content-Disposition header (plain `filename="x.pdf"`); only a safe plain name is accepted. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const name = header?.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
  return name && /^[\w.-]+$/.test(name) ? name : fallback;
}

export async function fetchReport(target: ReportTarget): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await fetch(reportUrl(target));
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new ApiError(response.status, failureMessage(response.status, body?.detail, "Could not create the report"));
  }
  const filename = filenameFromDisposition(response.headers.get("content-disposition"), fallbackReportName(target));
  return { blob: await response.blob(), filename };
}

export function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
