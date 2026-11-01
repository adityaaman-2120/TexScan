import { describe, expect, it } from "vitest";
import { markerPdfUrl, parseMarkerSide } from "./markerPdf";

describe("parseMarkerSide", () => {
  it("accepts sizes the printable page supports", () => {
    expect(parseMarkerSide("50")).toBe(50);
    expect(parseMarkerSide("62,5")).toBe(62.5);
    expect(parseMarkerSide("10")).toBe(10);
    expect(parseMarkerSide("150")).toBe(150);
  });

  it("rejects everything else", () => {
    for (const bad of ["", "abc", "9.9", "151", "0", "-50"]) expect(parseMarkerSide(bad)).toBeNull();
  });
});

describe("markerPdfUrl", () => {
  it("points at the API with the size", () => {
    expect(markerPdfUrl(62.5)).toBe("/api/calibration/marker.pdf?side_mm=62.5");
  });
});
