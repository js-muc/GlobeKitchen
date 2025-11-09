// apps/web/lib/adminApi.ts
// Self-contained fetch wrapper (no CORE import)

type Json = Record<string, unknown>;

const RAW_BASE = process.env.NEXT_PUBLIC_CORE_API || "http://localhost:4000/api";
// normalize so we always end with ".../api"
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
    headers: authHeaders(), // concrete Record<string,string>
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export type FieldDailyItem = {
  employeeId: number;
  employeeName: string;
  soldAmount?: number;
  cashRemit?: number;
  commission?: number;
  deductions?: number;
  grossSales?: number;
};

export async function getFieldDailySummary(dateIso: string) {
  // Expected API: GET /field/summary/daily?date=YYYY-MM-DD
  // Response: { ok: boolean; date: string; items: FieldDailyItem[] }
  const data = await httpGet<{ ok: boolean; date: string; items?: FieldDailyItem[] }>(
    "/field/summary/daily",
    { date: dateIso }
  );
  return (data?.items ?? []) as FieldDailyItem[];
}
