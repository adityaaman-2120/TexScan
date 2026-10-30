import { describe, expect, it } from "vitest";
import { hotkeyFor, ownsKeyboard } from "./hotkeys";

const press = (key: string, extra: Record<string, unknown> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, target: null, ...extra }) as Parameters<typeof hotkeyFor>[0];

describe("hotkeyFor", () => {
  it("maps U to upload and X to x-ray, either case", () => {
    expect(hotkeyFor(press("u"))).toBe("upload");
    expect(hotkeyFor(press("U"))).toBe("upload");
    expect(hotkeyFor(press("x"))).toBe("xray");
  });

  it("ignores other keys", () => {
    expect(hotkeyFor(press("a"))).toBeNull();
    expect(hotkeyFor(press("Enter"))).toBeNull();
  });

  it("never steals Ctrl/Cmd/Alt/Shift combinations (Ctrl+K, Ctrl+X cut, Cmd+U view source)", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey", "shiftKey"]) {
      expect(hotkeyFor(press("x", { [mod]: true }))).toBeNull();
      expect(hotkeyFor(press("u", { [mod]: true }))).toBeNull();
    }
  });

  it("ignores key repeat and events another handler already used", () => {
    expect(hotkeyFor(press("u", { repeat: true }))).toBeNull();
    expect(hotkeyFor(press("u", { defaultPrevented: true }))).toBeNull();
  });

  it("does not fire while typing or inside a dialog / menu", () => {
    expect(hotkeyFor(press("x", { target: { tagName: "INPUT" } }))).toBeNull();
    expect(hotkeyFor(press("x", { target: { tagName: "textarea" } }))).toBeNull();
    expect(hotkeyFor(press("x", { target: { tagName: "DIV", isContentEditable: true } }))).toBeNull();
    expect(hotkeyFor(press("x", { target: { tagName: "DIV", closest: () => ({}) } }))).toBeNull();
    expect(hotkeyFor(press("x", { target: { tagName: "BODY", closest: () => null } }))).toBe("xray");
  });
});

describe("ownsKeyboard", () => {
  it("is false when there is no target", () => {
    expect(ownsKeyboard(null)).toBe(false);
  });
});
