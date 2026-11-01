export const APP_BASE = "/app";

export type Entry = { kind: "landing" } | { kind: "app" } | { kind: "legacy"; to: string };

/**
 * Which part of the site a URL belongs to: the public landing page at "/", the app under "/app", or an old app path
 * (such as a bookmarked "/inspect") that is sent to its place under "/app".
 */
export function entryFor(pathname: string, search = "", hash = ""): Entry {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { kind: "landing" };
  if (path === APP_BASE || path.startsWith(`${APP_BASE}/`)) return { kind: "app" };
  return { kind: "legacy", to: `${APP_BASE}${path}${search}${hash}` };
}
