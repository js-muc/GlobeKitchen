// apps/web/lib/payrollApi.ts
// Self-contained fetch wrapper (no CORE import)

type Json = Record<string, unknown>;

const RAW_BASE = process.env.NEXT_PUBLIC_CORE_API || "http://localhost:4000/api";
const API_BASE = /\/api\/?$/.test(RAW_BASE)
  ? RAW_BASE.replace(/\/$/, "")
  : `${RAW_BASE.replace(/\/$/, "")}/api`;

function qs(params?: Record<string, any>) {
  if (!params) return "";
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const t = localStorage.getItem("adminJWT");
    if (t) h.Authorization = `Bearer ${t}`;
  }
  return h;
}

async function httpGet<T = any>(path: string, params?: Json): Promise<T> {
  const res = await fetch(`${API_BASE}${path}${qs(params)}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function httpPost<T = any>(path: string, body?: any, params?: Json): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
  };
  const res = await fetch(`${API_BASE}${path}${qs(params)}`, {
    method: "POST",
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function listPayrollRuns(params?: { year?: number; month?: number; includeLines?: boolean }) {
  // GET /payroll?year=&month=&includeLines=
  return httpGet<any>("/payroll", params);
}

export async function runPayroll(year: number, month: number, overwrite = true) {
  // POST /payroll/run?year=&month=&overwrite=
  return httpPost<any>("/payroll/run", null, { params: { year, month, overwrite: true } });
}

export async function getPayrollByYm(year: number, month: number) {
  // GET /payroll/{year}-{month}
  return httpGet<any>(`/payroll/${year}-${month}`);
}
