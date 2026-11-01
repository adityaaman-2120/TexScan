import { describe, expect, it } from "vitest";
import { METHOD_LABELS } from "@/api/types";
import { methodLabel, PRODUCT_METHOD_LABELS } from "./methodLabel";

describe("methodLabel", () => {
  it("uses the technical name in engineering mode", () => {
    expect(methodLabel("fft", true)).toBe(METHOD_LABELS.fft);
    expect(methodLabel("gabor", true)).toBe("Gabor bank");
  });

  it("uses operator wording otherwise", () => {
    expect(methodLabel("gabor", false)).toBe("Texture scan");
    expect(methodLabel("local_statistics", false)).toBe("Surface scan");
  });

  it("never leaks an algorithm name in product mode", () => {
    for (const label of Object.values(PRODUCT_METHOD_LABELS)) expect(label).not.toMatch(/fft|gabor|fourier|statistics|template/i);
  });

  it("shows an unknown method as stored", () => {
    expect(methodLabel("custom", false)).toBe("custom");
  });
});
