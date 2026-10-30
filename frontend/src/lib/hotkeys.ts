export type Hotkey = "upload" | "xray";

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
}

interface ElementLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
/** Places where a plain letter already means something else: open menus, dialogs, the command palette. */
const OWNS_KEYBOARD = '[role="dialog"], [role="listbox"], [role="menu"], [role="combobox"], [cmdk-root]';

/** True when a letter typed here is text (or a menu's type-ahead), not a page shortcut. */
export function ownsKeyboard(target: EventTarget | null): boolean {
  const el = target as ElementLike | null;
  if (!el) return false;
  if (el.tagName && TYPING_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.(OWNS_KEYBOARD));
}

const KEYS: Record<string, Hotkey> = { u: "upload", x: "xray" };

/** Which single-letter page shortcut a key event is, if any. Ctrl/Cmd/Alt combos and typing are never shortcuts. */
export function hotkeyFor(e: KeyLike): Hotkey | null {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  if (ownsKeyboard(e.target)) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}
