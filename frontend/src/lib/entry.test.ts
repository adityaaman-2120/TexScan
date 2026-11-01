import { describe, expect, it } from "vitest";
import { entryFor } from "./entry";

describe("entryFor", () => {
  it("shows the landing page only at the root", () => {
    expect(entryFor("/")).toEqual({ kind: "landing" });
    expect(entryFor("")).toEqual({ kind: "landing" });
  });

  it("keeps everything under /app in the app", () => {
    for (const p of ["/app", "/app/", "/app/inspect", "/app/roll/12", "/app/profiles/3/calibration"]) expect(entryFor(p)).toEqual({ kind: "app" });
  });

  it("sends an old app path to its place under /app, keeping the query and hash", () => {
    expect(entryFor("/inspect")).toEqual({ kind: "legacy", to: "/app/inspect" });
    expect(entryFor("/history/", "?id=12&tab=rolls", "#x")).toEqual({ kind: "legacy", to: "/app/history?id=12&tab=rolls#x" });
    expect(entryFor("/live", "?roll=3&at=1.2")).toEqual({ kind: "legacy", to: "/app/live?roll=3&at=1.2" });
  });

  it("does not mistake a path that merely starts with the letters app", () => {
    expect(entryFor("/application")).toEqual({ kind: "legacy", to: "/app/application" });
  });
});
