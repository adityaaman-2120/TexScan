import { describe, expect, it } from "vitest";
import { fallbackReportName, filenameFromDisposition, reportUrl } from "./report";

describe("reportUrl", () => {
  it("points at the inspection and batch report endpoints", () => {
    expect(reportUrl({ kind: "inspection", id: 12 })).toBe("/api/inspections/12/report.pdf");
    expect(reportUrl({ kind: "batch", id: "abc123" })).toBe("/api/batches/abc123/report.pdf");
  });

  it("encodes a batch id so it cannot change the path", () => {
    expect(reportUrl({ kind: "batch", id: "../x?y" })).toBe("/api/batches/..%2Fx%3Fy/report.pdf");
  });
});

describe("report file names", () => {
  it("reads the server's name and ignores anything unsafe", () => {
    expect(filenameFromDisposition('attachment; filename="texscan-inspection-3.pdf"', "fb.pdf")).toBe("texscan-inspection-3.pdf");
    expect(filenameFromDisposition("attachment; filename=plain.pdf", "fb.pdf")).toBe("plain.pdf");
    expect(filenameFromDisposition('attachment; filename="../../evil.pdf"', "fb.pdf")).toBe("fb.pdf");
    expect(filenameFromDisposition(null, "fb.pdf")).toBe("fb.pdf");
  });

  it("falls back to a readable name per target", () => {
    expect(fallbackReportName({ kind: "inspection", id: 7 })).toBe("texscan-inspection-7.pdf");
    expect(fallbackReportName({ kind: "batch", id: "0123456789abcdef" })).toBe("texscan-batch-01234567.pdf");
  });
});
