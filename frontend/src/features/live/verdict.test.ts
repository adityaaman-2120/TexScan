import { describe, expect, it } from "vitest";
import { verdictView } from "./verdict";

const base = { cameraReady: true, paused: false, status: "live" as const, decision: "PASS" as const, stale: false, defectCount: 0, serverMessage: null };

describe("verdictView", () => {
  it("shows the decision when everything is live and fresh", () => {
    expect(verdictView(base)).toMatchObject({ kind: "pass", label: "PASS" });
    expect(verdictView({ ...base, decision: "FAIL", defectCount: 3 })).toMatchObject({ kind: "fail", label: "FAIL", detail: "3 defects found." });
    expect(verdictView({ ...base, decision: "FAIL", defectCount: 1 }).detail).toBe("1 defect found.");
  });

  it("says the camera is off before anything else", () => {
    expect(verdictView({ ...base, cameraReady: false, paused: true })).toMatchObject({ kind: "off" });
  });

  it("pauses win over connection state and remember the last result", () => {
    const v = verdictView({ ...base, paused: true, status: "offline", decision: "FAIL" });
    expect(v.kind).toBe("paused");
    expect(v.detail).toContain("FAIL");
    expect(verdictView({ ...base, paused: true, decision: null }).detail).toMatch(/frozen/);
  });

  it("reports connection problems instead of a stale verdict", () => {
    expect(verdictView({ ...base, status: "connecting" })).toMatchObject({ kind: "connecting", label: "CONNECTING" });
    expect(verdictView({ ...base, status: "reconnecting" }).label).toBe("RECONNECTING");
    expect(verdictView({ ...base, status: "offline" }).kind).toBe("offline");
    expect(verdictView({ ...base, status: "error", serverMessage: "no profile 9" })).toMatchObject({ kind: "error", detail: "no profile 9" });
  });

  it("waits when there is no fresh result", () => {
    expect(verdictView({ ...base, decision: null }).kind).toBe("waiting");
    expect(verdictView({ ...base, stale: true }).kind).toBe("waiting");
  });
});
