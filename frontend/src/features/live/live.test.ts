import { describe, expect, it } from "vitest";
import { checkSupport, describeCameraError } from "./cameraErrors";
import { calibrationName, CALIBRATION_FRAMES } from "./calibration";
import { backoffSeconds, fitFrame, fpsFrom, isStale, liveSocketUrl, mean, placeBox, regionRect, scaleBox, centerFraction, CENTER_FRACTION, UPLOAD_SIDE, WHOLE_FRAME } from "./liveMath";

const domError = (name: string) => new DOMException("x", name);

describe("describeCameraError", () => {
  it("explains a blocked permission", () => {
    const f = describeCameraError(domError("NotAllowedError"));
    expect(f.problem).toBe("denied");
    expect(f.help).toMatch(/address bar/);
    expect(describeCameraError(domError("SecurityError")).problem).toBe("denied");
  });

  it("recognises a missing camera, a busy camera and a format the camera cannot do", () => {
    expect(describeCameraError(domError("NotFoundError")).problem).toBe("nocamera");
    expect(describeCameraError(domError("NotReadableError")).problem).toBe("busy");
    expect(describeCameraError(domError("OverconstrainedError")).problem).toBe("constraints");
  });

  it("falls back to the error's own message for anything else", () => {
    const f = describeCameraError(new Error("weird driver failure"));
    expect(f.problem).toBe("error");
    expect(f.help).toBe("weird driver failure");
    expect(describeCameraError("not an error object").problem).toBe("error");
  });
});

describe("checkSupport", () => {
  it("is fine when the media API exists", () => {
    expect(checkSupport({ isSecureContext: true, hasMediaDevices: true })).toBeNull();
  });

  it("explains that a plain-HTTP page has no camera and how to fix it", () => {
    const f = checkSupport({ isSecureContext: false, hasMediaDevices: false })!;
    expect(f.problem).toBe("insecure");
    expect(f.help).toMatch(/dev-lan|-Lan/);
  });

  it("distinguishes an unsupported browser on a secure page", () => {
    expect(checkSupport({ isSecureContext: true, hasMediaDevices: false })!.problem).toBe("unsupported");
  });
});

describe("fitFrame", () => {
  it("scales the longest side to the target and keeps the aspect ratio", () => {
    expect(fitFrame(1280, 720, 320)).toEqual({ w: 320, h: 180 });
    expect(fitFrame(720, 1280, 320)).toEqual({ w: 180, h: 320 });
  });

  it("never upscales and never returns a zero side", () => {
    expect(fitFrame(160, 120, 320)).toEqual({ w: 160, h: 120 });
    expect(fitFrame(4000, 1, 100).h).toBe(1);
  });
});

describe("scaleBox", () => {
  const from = { w: 320, h: 180 };
  const to = { w: 640, h: 360 };

  it("maps working-image pixels to canvas pixels", () => {
    expect(scaleBox([10, 20, 30, 40], from, to)).toEqual({ x: 20, y: 40, w: 60, h: 80 });
  });

  it("flips horizontally for a mirrored preview", () => {
    const m = scaleBox([10, 20, 30, 40], from, to, true);
    expect(m).toEqual({ x: 640 - 20 - 60, y: 40, w: 60, h: 80 });
  });

  it("maps a full-frame box to the full canvas", () => {
    expect(scaleBox([0, 0, 320, 180], from, to)).toEqual({ x: 0, y: 0, w: 640, h: 360 });
  });
});

describe("fpsFrom / mean / isStale", () => {
  it("computes the rate from arrival times inside the window", () => {
    const arrivals = [0, 200, 400, 600, 800, 1000];
    expect(fpsFrom(arrivals, 1000)).toBeCloseTo(5);
    expect(fpsFrom([0, 200], 10_000)).toBe(0); // too old
    expect(fpsFrom([500], 600)).toBe(0); // one sample is not a rate
    expect(fpsFrom([], 0)).toBe(0);
  });

  it("averages, and has no average of nothing", () => {
    expect(mean([100, 200, 300])).toBe(200);
    expect(mean([])).toBeNull();
  });

  it("calls a result stale after a couple of seconds", () => {
    expect(isStale(null, 1000)).toBe(true);
    expect(isStale(1000, 2000)).toBe(false);
    expect(isStale(1000, 4000)).toBe(true);
  });
});

describe("liveSocketUrl", () => {
  it("uses wss on https pages and ws on http", () => {
    expect(liveSocketUrl({ protocol: "https:", host: "192.168.1.5:5173", method: "fft", profileId: null, maxSide: 320 })).toBe("wss://192.168.1.5:5173/api/ws/live?method=fft&max_side=320");
    expect(liveSocketUrl({ protocol: "http:", host: "localhost:5173", method: "gabor", profileId: null, maxSide: 240 })).toBe("ws://localhost:5173/api/ws/live?method=gabor&max_side=240");
  });

  it("lets a profile decide the working size", () => {
    const url = liveSocketUrl({ protocol: "http:", host: "h", method: "fft", profileId: 3, maxSide: 320 });
    expect(url).toContain("profile_id=3");
    expect(url).not.toContain("max_side");
  });
});

describe("backoffSeconds", () => {
  it("doubles up to a cap", () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffSeconds)).toEqual([1, 2, 4, 8, 8, 8]);
  });
});

describe("regionRect / centerFraction", () => {
  it("maps the server's inspected region onto the stage", () => {
    expect(regionRect([0.25, 0, 0.5, 1], { w: 800, h: 400 })).toEqual({ x: 200, y: 0, w: 400, h: 400 });
    expect(regionRect(WHOLE_FRAME, { w: 800, h: 400 })).toEqual({ x: 0, y: 0, w: 800, h: 400 });
  });

  it("inspects 60 % of each side for the centre area and everything for full", () => {
    expect(centerFraction("center")).toBe(CENTER_FRACTION);
    expect(centerFraction("full")).toBe(1);
  });

  it("asks the server for the centre only when it is not the whole picture", () => {
    const base = { protocol: "http:", host: "h", method: "gabor", profileId: null, maxSide: 320 };
    expect(liveSocketUrl(base)).not.toContain("center");
    expect(liveSocketUrl({ ...base, center: 1 })).not.toContain("center");
    expect(liveSocketUrl({ ...base, center: 0.6 })).toContain("center=0.6");
  });
});

describe("placeBox", () => {
  const region = { x: 100, y: 50, w: 300, h: 200 };

  it("offsets and scales a box from the working image into the inspected region", () => {
    expect(placeBox([10, 20, 30, 40], { w: 150, h: 100 }, region, 500)).toEqual({ x: 120, y: 90, w: 60, h: 80 });
  });

  it("flips about the whole stage for a mirrored preview", () => {
    expect(placeBox([10, 20, 30, 40], { w: 150, h: 100 }, region, 500, true)).toEqual({ x: 500 - 120 - 60, y: 90, w: 60, h: 80 });
  });

  it("is the same as scaleBox when the region is the whole stage", () => {
    const stage = { x: 0, y: 0, w: 400, h: 300 };
    const box = [5, 6, 7, 8] as const;
    expect(placeBox(box, { w: 200, h: 150 }, stage, 400)).toEqual(scaleBox(box, { w: 200, h: 150 }, { w: 400, h: 300 }));
  });
});

describe("upload size", () => {
  it("is larger than every working size, so detail survives the server-side crop", () => {
    expect(UPLOAD_SIDE).toBeGreaterThanOrEqual(480);
  });
});

describe("calibration", () => {
  it("names a profile after the moment it was made", () => {
    expect(calibrationName(new Date(2026, 9, 31, 14, 5))).toBe("Live camera 2026-10-31 14:05");
    expect(calibrationName(new Date(2027, 0, 2, 3, 4))).toBe("Live camera 2027-01-02 03:04");
  });

  it("takes a number of frames the server accepts", () => {
    expect(CALIBRATION_FRAMES).toBeGreaterThanOrEqual(5);
    expect(CALIBRATION_FRAMES).toBeLessThanOrEqual(20);
  });
});
