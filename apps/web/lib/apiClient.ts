// apps/web/lib/apiClient.ts

export function makeApi(token?: string) {
  const RAW_BASE =
    process.env.NEXT_PUBLIC_CORE_API ||
    (typeof window !== "undefined" && (window as any).__CORE_API__) ||
    "http://localhost:4000/api";

  const ROOT = String(RAW_BASE).replace(/\/+$/, "");
  const API_BASE = /\/api$/i.test(ROOT) ? ROOT : `${ROOT}/api`;

  const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  async function parseJsonSafely(res: Response) {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async function handle<T>(res: Response): Promise<T> {
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      const msg =
        (data && (data as any).error) ||
        (data && (data as any).message) ||
        (typeof data === "string" ? data : res.statusText);
      throw new Error(msg || `HTTP ${res.status}`);
    }
    return data as T;
  }

  return {
    API_BASE,

    async get<T = any>(path: string): Promise<T> {
      const headers: HeadersInit = {
        Accept: "application/json",
        ...auth,
      };
      const res = await fetch(`${API_BASE}${path}`, {
        method: "GET",
        headers,
        credentials: "include",
        cache: "no-store",
      });
      return handle<T>(res);
    },

    async post<T = any>(path: string, body?: any): Promise<T> {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...auth,
      };
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
        credentials: "include",
      });
      return handle<T>(res);
    },
  };
}
