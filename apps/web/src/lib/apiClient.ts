// apps/web/src/lib/apiClient.ts
// Typed ApiClient + makeApi factory used across the web UI.
// Purpose: share a single typed API client so PreviewCells etc. can call api.get<T>()
// without "untyped function calls may not accept type arguments" errors.

export type ApiClient = {
  get<T = any>(path: string, init?: RequestInit): Promise<T>;
  post<T = any>(path: string, body?: any, init?: RequestInit): Promise<T>;
};

const RAW_BASE = (process.env.NEXT_PUBLIC_CORE_API || "http://localhost:4000/api") as string;
export const API_BASE = /\/api\/?$/.test(RAW_BASE) ? RAW_BASE.replace(/\/$/, "") : `${RAW_BASE.replace(/\/$/, "")}/api`;

export function makeApi(token?: string): ApiClient {
  // Use HeadersInit | undefined to satisfy fetch typing
  const baseHeaders: HeadersInit | undefined = token ? { Authorization: `Bearer ${token}` } : undefined;

  return {
    async get<T = any>(path: string, init?: RequestInit): Promise<T> {
      // Compose headers carefully so undefined doesn't get passed to fetch
      const initHeaders = (init && (init.headers as Record<string, string>)) || {};
      const headers = Object.assign({}, initHeaders, baseHeaders || {});
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        cache: "no-store",
        headers,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    async post<T = any>(path: string, body?: any, init?: RequestInit): Promise<T> {
      const initHeaders = (init && (init.headers as Record<string, string>)) || {};
      const headers = Object.assign({ "Content-Type": "application/json" }, initHeaders, baseHeaders || {});
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        ...init,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  };
}
