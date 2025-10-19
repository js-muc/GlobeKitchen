// apps/web/src/lib/config.ts
// Normalizes env var names so older/newer code both work,
// and provides safe URL join helpers for API calls.

/** pick first defined, non-empty value */
const pick = (...vals: Array<string | undefined>) =>
  vals.find((v) => typeof v === "string" && v.trim().length > 0);

/** remove any trailing slashes */
const stripTrailing = (s: string) => s.replace(/\/+$/, "");

/** normalize a base URL (ensure protocol, drop trailing slash) */
const normalizeBase = (s: string) => {
  const v = s.trim();
  if (!/^https?:\/\//i.test(v)) return stripTrailing(`http://${v}`);
  return stripTrailing(v);
};

// ---- raw values (support legacy names), with native-dev defaults
const RAW_CORE =
  pick(process.env.NEXT_PUBLIC_CORE_API, process.env.NEXT_PUBLIC_API_BASE) ??
  "http://localhost:4200/api";
const RAW_SERVER =
  pick(process.env.NEXT_PUBLIC_SERVER_API, process.env.NEXT_PUBLIC_MENU_API_BASE) ??
  "http://localhost:4100/api";

// ---- normalized public bases
export const CORE_API = normalizeBase(RAW_CORE);
export const SERVER_API = normalizeBase(RAW_SERVER);

// ---- helpers to build endpoint URLs safely (avoid //)
const trimSlashes = (p: string) => p.replace(/^\/+|\/+$/g, "");

export const coreUrl = (
  ...parts: Array<string | number | null | undefined | false>
) => [CORE_API, ...parts.filter(Boolean).map((p) => trimSlashes(String(p)))].join("/");

export const serverUrl = (
  ...parts: Array<string | number | null | undefined | false>
) => [SERVER_API, ...parts.filter(Boolean).map((p) => trimSlashes(String(p)))].join("/");

// ---- misc flags / defaults
export const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "http://localhost:3000";
export const IS_DOCKER_API = CORE_API.includes(":4000") || SERVER_API.includes(":4000");
