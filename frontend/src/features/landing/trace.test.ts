import { describe, expect, it } from "vitest";
import { TRACE } from "./trace";

describe("TRACE", () => {
  it("has unique steps, each with a name, a formula and a reason", () => {
    expect(new Set(TRACE.map((t) => t.id)).size).toBe(TRACE.length);
    for (const t of TRACE) expect(t.name.length * t.formula.length * t.why.length).toBeGreaterThan(0);
  });

  it("follows the pipeline's order, from the photo to the outline", () => {
    expect(TRACE[0]!.id).toBe("gray");
    expect(TRACE.at(-1)!.id).toBe("outline");
    expect(TRACE.map((t) => t.id).indexOf("spectrum")).toBeLessThan(TRACE.map((t) => t.id).indexOf("notch"));
    expect(TRACE.map((t) => t.id).indexOf("threshold")).toBeLessThan(TRACE.map((t) => t.id).indexOf("clean"));
  });
});
