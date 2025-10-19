// LABEL: WEB_CONFIG_V1
// Central place for client-side API base URLs. Works in SSR and browser.

function trimBase(raw: string | null | undefined, fallback: string) {
  const s = (raw ?? "").trim();
  return (s.length ? s : fallback).replace(/\/+$/, "");
}

/** Safe env accessor (no Node typings required) */
const env = ((globalThis as any)?.process?.env ?? {}) as Record<string, string | undefined>;

/**
 * CORE API (monolith, where daily-sales lives)
 * Reads common envs and falls back to http://localhost:4000/api
 */
export const SERVER_API = trimBase(
  env.NEXT_PUBLIC_CORE_API ||
    env.NEXT_PUBLIC_API_BASE_URL ||
    env.NEXT_PUBLIC_API_BASE ||
    env.NEXT_PUBLIC_SERVER_API,
  "http://localhost:4000/api"
);

/**
 * MENU API (separate service if you use 4100 for menu items)
 * Only needed if other parts of the app import it.
 */
export const MENU_API = trimBase(
  env.NEXT_PUBLIC_MENU_API || env.NEXT_PUBLIC_MENU_API_BASE,
  "http://127.0.0.1:4100/api"
);

/** Whether SERVER_API is same-origin with the web app (useful for cookie auth decisions) */
export const IS_SAME_ORIGIN = (() => {
  try {
    if (typeof window === "undefined") return false;
    const apiOrigin = new URL(SERVER_API).origin;
    return window.location.origin === apiOrigin;
  } catch {
    return false;
  }
})();

export const SERVER_ORIGIN = (() => {
  try { return new URL(SERVER_API).origin; } catch { return SERVER_API; }
})();

