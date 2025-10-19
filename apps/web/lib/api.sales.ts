// apps/web/lib/api.sales.ts
// LABEL: API_SALES_V8
// - Preserves original exports & behavior
// - Aligns with /daily-sales/* backend you shared
// - Adds grouped-today + daily rollup helpers
// - Safer headers & error handling

import { SERVER_API } from "@/lib/config";
import { getAuthToken } from "@/lib/api";

/** ----- Types (preserved) ----- */
export type ShiftStatus = "OPEN" | "SUBMITTED" | "CLOSED";

export type Shift = {
  id: number;
  date: string; // YYYY-MM-DD (UI-level; backend stores ISO)
  employeeId: number;
  status: ShiftStatus;
  cashExpected: number;
  cashReceived: number;
  shortOver: number;
  lines: Array<{
    id: number;
    type: "ISSUE" | "ADD" | "RETURN" | "SALE" | "ADJUSTMENT";
    itemId: number;
    qty: number;
    unit: string;
    unitPrice: number;
    tableCode?: string;
  }>;
};

export type SummaryRow = {
  itemId: number;
  unit: string;
  price: number;
  issued: number;
  added: number;
  returned: number;
  sold: number;
  remaining: number;
  cashDue: number;
};

export type ShiftSummary = {
  byItem: SummaryRow[];
  totals: { cashDue: number; lines: number };
};

export type CloseShiftInput = {
  cashReceived?: number;
  note?: string;
  submit?: boolean;
  force?: boolean;
  submittedBy?: number | string;
};

export type CashupInput = {
  submittedBy?: number | string;
  note?: string;
};

export type ShiftListItem = {
  id: number;
  date: string;
  employeeId: number;
  waiterType?: string;
  openedAt?: string | null;
  closedAt?: string | null;
  grossSales?: number;
  netSales?: number;
  cashRemit?: number | null;
  notes?: string | null;
};

/** ----- “Today grouped by employee” types ----- */
export type TodayEmployeeGroup = {
  employeeId: number;
  employeeName: string;
  totalCashDue: number;
  shifts: Array<{
    id: number;
    status: "OPEN" | "CLOSED";
    openedAt: string;
    closedAt: string | null;
    cashDue: number;
    lastCashupAt: string | null;
  }>;
};
export type TodayGroupedResponse = {
  date: string; // YYYY-MM-DD
  waiterType: "INSIDE" | "FIELD" | null;
  employees: TodayEmployeeGroup[];
};

/** ----- Utilities ----- */
function todayYmd() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Normalize server shift payload into the UI’s Shift shape */
function normalizeShift(raw: any): Shift {
  const iso = String(raw?.date ?? raw?.openedAt ?? "");
  const ymd = (iso || "").slice(0, 10);
  const status: ShiftStatus = raw?.status ?? (raw?.closedAt ? "CLOSED" : "OPEN");

  return {
    id: Number(raw?.id ?? 0),
    date: ymd || todayYmd(),
    employeeId: Number(raw?.employeeId ?? 0),
    status,
    cashExpected: Number(raw?.cashExpected ?? raw?.netSales ?? raw?.grossSales ?? 0),
    cashReceived: Number(raw?.cashReceived ?? raw?.cashRemit ?? 0),
    shortOver: Number(raw?.shortOver ?? 0),
    lines: Array.isArray(raw?.lines) ? raw.lines : [],
  };
}

/** Build a concrete Headers object; only set Content-Type if there’s a body */
function buildHeaders(extra?: HeadersInit, hasBody?: boolean): Headers {
  const h = new Headers();
  h.set("Accept", "application/json");
  if (hasBody) h.set("Content-Type", "application/json");

  const t = getAuthToken();
  if (t) h.set("Authorization", `Bearer ${t}`);

  if (extra) {
    if (extra instanceof Headers) extra.forEach((v, k) => h.set(k, v));
    else if (Array.isArray(extra)) for (const [k, v] of extra) h.set(k, v as string);
    else for (const [k, v] of Object.entries(extra)) h.set(k, v as string);
  }
  return h;
}

/** Standardized fetch wrapper */
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = !!init?.body;
  const res = await fetch(`${SERVER_API}${path}`, {
    method: "GET",
    credentials: "include",
    ...init,
    headers: buildHeaders(init?.headers, hasBody),
  });

  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    const err = new Error(
      `HTTP ${res.status} ${res.statusText} @ ${path} :: ${
        typeof detail === "string" ? detail : JSON.stringify(detail)
      }`
    ) as Error & { status?: number; detail?: unknown };
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

const isHttpError = (e: unknown): e is { status?: number } =>
  !!e && typeof e === "object" && "status" in (e as any);

/** ----- API calls (aligned to /daily-sales routes) ----- */

/**
 * Open (or get) a shift.
 * Signature preserved; server is idempotent.
 * POST /daily-sales/shifts/open
 */
export async function createOrGetShift(
  params: { employeeId: number; date?: string } & Record<string, any>
) {
  const payload = {
    date: params.date ?? todayYmd(),
    employeeId: params.employeeId,
    waiterType: (params.waiterType as "INSIDE" | "FIELD") ?? "INSIDE",
    tableCode: params.tableCode ?? undefined,
    openingFloat: params.openingFloat ?? undefined,
    route: params.route ?? undefined,
    notes: params.notes ?? undefined,
  };

  const data = await http<any>(`/daily-sales/shifts/open`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return normalizeShift(data?.shift ?? data);
}

export type LinePayload = {
  type: "ISSUE" | "ADD" | "RETURN" | "SALE" | "ADJUSTMENT"; // accepted by caller; server ignores today
  itemId: number;
  qty: number;
  unit: string;
  unitPrice: number;
  tableCode?: string;
  note?: string;
};

/**
 * Add a line to a shift.
 * POST /daily-sales/lines (supports SALE add)
 */
export async function addShiftLine(shiftId: number, payload: LinePayload) {
  const body = {
    shiftId,
    itemId: payload.itemId,
    qty: payload.qty,
    unitPrice: payload.unitPrice,
    unit: payload.unit,
    note: payload.note ?? undefined,
  };

  const data = await http<any>(`/daily-sales/lines`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return (data?.line ?? data) as { id: number } & LinePayload;
}

/** GET /daily-sales/shifts/:id/summary (fallback derives from lines) */
export async function getShiftSummary(shiftId: number): Promise<ShiftSummary> {
  try {
    return await http<ShiftSummary>(`/daily-sales/shifts/${shiftId}/summary`);
  } catch (e: any) {
    if (!isHttpError(e) || e.status !== 404) throw e;

    // Fallback: derive from lines
    const list = await http<{
      data: Array<{
        id: number;
        itemId: number;
        qty: number;
        unit: string;
        unitPrice: number | string;
      }>;
    }>(`/daily-sales/shifts/${shiftId}/lines?page=1&limit=1000`);

    const rows = new Map<number, SummaryRow>();
    for (const l of list.data ?? []) {
      const priceNum = typeof l.unitPrice === "string" ? Number(l.unitPrice) : l.unitPrice;
      const current =
        rows.get(l.itemId) ??
        ({
          itemId: l.itemId,
          unit: l.unit,
          price: priceNum || 0,
          issued: 0,
          added: 0,
          returned: 0,
          sold: 0,
          remaining: 0,
          cashDue: 0,
        } as SummaryRow);

      current.sold += l.qty;
      current.cashDue += l.qty * (priceNum || 0);
      rows.set(l.itemId, current);
    }

    const byItem = Array.from(rows.values());
    const totals = {
      cashDue: byItem.reduce((s, r) => s + (r.cashDue || 0), 0),
      lines: list.data?.length ?? 0,
    };
    return { byItem, totals };
  }
}

/**
 * Close a shift (preferred then fallbacks).
 * 1) POST /daily-sales/shifts/:id/close
 * 2) PATCH /daily-sales/shifts/:id (if your server supports it)
 * 3) POST /daily-sales/shifts/close (legacy)
 */
export async function closeShift(
  shiftId: number,
  payload: CloseShiftInput = {}
): Promise<Shift> {
  try {
    const res = await http<any>(`/daily-sales/shifts/${shiftId}/close`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return normalizeShift(res?.shift ?? res);
  } catch (e: any) {
    if (!isHttpError(e) || e.status !== 404) throw e;
  }

  try {
    const body = { status: "CLOSED", ...payload };
    const res = await http<any>(`/daily-sales/shifts/${shiftId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return normalizeShift(res?.shift ?? res);
  } catch (e: any) {
    if (!isHttpError(e) || e.status !== 404) throw e;
  }

  const final = await http<any>(`/daily-sales/shifts/close`, {
    method: "POST",
    body: JSON.stringify({ shiftId, ...payload }),
  });
  return normalizeShift(final?.shift ?? final);
}

/** POST /daily-sales/shifts/:id/cashup (server-side snapshot) */
export async function createCashup(shiftId: number, payload: CashupInput = {}) {
  return http<any>(`/daily-sales/shifts/${shiftId}/cashup`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /daily-sales/shifts?dateFrom=&dateTo=&status=&employeeId=&page=&limit= */
export async function listShifts(params: {
  dateFrom?: string;
  dateTo?: string;
  status?: "OPEN" | "CLOSED";
  employeeId?: number;
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams(
    Object.entries(params ?? {})
      .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
      .map(([k, v]) => [k, String(v)])
  ).toString();

  return http<{
    data: ShiftListItem[];
    meta: { total: number; page: number; limit: number; pages: number };
  }>(`/daily-sales/shifts${qs ? `?${qs}` : ""}`);
}

/** ----- Cashup helpers ----- */

export async function getShiftCashup(shiftId: number) {
  return http<any>(`/daily-sales/shifts/${shiftId}/cashup`);
}

export async function listCashups(params: {
  date?: string; // YYYY-MM-DD
  employeeId?: number;
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams(
    Object.entries(params || {})
      .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
      .map(([k, v]) => [k, String(v)])
  ).toString();

  return http<{
    data: any[];
    meta: { total: number; page: number; limit: number; pages: number };
  }>(`/daily-sales/cashups${qs ? `?${qs}` : ""}`);
}

/** Optional: DELETE /daily-sales/cashups/:id (if server supports) */
export async function deleteCashup(cashupId: number) {
  return http<{ ok: true }>(`/daily-sales/cashups/${cashupId}`, {
    method: "DELETE",
  });
}

/** GET /daily-sales/shifts/today?waiterType=INSIDE|FIELD */
export async function getTodayShiftsGrouped(waiterType?: "INSIDE" | "FIELD") {
  const qs = waiterType ? `?waiterType=${encodeURIComponent(waiterType)}` : "";
  return http<TodayGroupedResponse>(`/daily-sales/shifts/today${qs}`);
}

/** GET /daily-sales/summary/daily?date=YYYY-MM-DD */
export async function getDailyRollup(date: string = todayYmd()) {
  return http<{ byItem: SummaryRow[]; totals: { cashDue: number; lines: number } }>(
    `/daily-sales/summary/daily?date=${encodeURIComponent(date)}`
  );
}
