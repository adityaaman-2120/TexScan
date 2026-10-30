import { describe, expect, it } from "vitest";
import { ApiError, failureMessage, isUnreachable, NETWORK_MESSAGE } from "./errors";

describe("failureMessage", () => {
  it("says the backend is unreachable when a proxy answers 502/503/504 with no message of ours", () => {
    for (const status of [502, 503, 504]) expect(failureMessage(status, undefined, "Bad Gateway")).toBe(NETWORK_MESSAGE);
  });

  it("keeps the API's own message, even on a 503", () => {
    expect(failureMessage(503, "profile busy", "Service Unavailable")).toBe("profile busy");
    expect(failureMessage(404, "no inspection with id 9", "Not Found")).toBe("no inspection with id 9");
  });

  it("formats validation errors and falls back to the status text", () => {
    expect(failureMessage(422, [{ loc: ["body", "files"], msg: "required" }], "x")).toBe("files: required");
    expect(failureMessage(500, undefined, "Internal Server Error")).toBe("Internal Server Error");
  });
});

describe("isUnreachable", () => {
  it("is true for a network failure and for a gateway error turned into the network message", () => {
    expect(isUnreachable(new ApiError(0, NETWORK_MESSAGE))).toBe(true);
    expect(isUnreachable(new ApiError(502, NETWORK_MESSAGE))).toBe(true);
  });

  it("is false for ordinary errors", () => {
    expect(isUnreachable(new ApiError(404, "not found"))).toBe(false);
    expect(isUnreachable(new ApiError(503, "profile busy"))).toBe(false);
    expect(isUnreachable(new Error("boom"))).toBe(false);
  });
});
