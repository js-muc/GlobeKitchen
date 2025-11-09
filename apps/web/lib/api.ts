// File: apps/web/lib/api.ts
// ✅ API clients (monolith + menu service) — robust, single source of truth for base URLs

import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { SERVER_API as API_BASE, MENU_API as MENU_API_BASE, IS_SAME_ORIGIN as WEB_SAME_ORIGIN } from "./config";

/* ======================================
   ORIGINS (helpful exports)
====================================== */
export const CORE_ORIGIN = (() => {
  try { return new URL(API_BASE).origin; } catch { return API_BASE; }
})();
export const MENU_ORIGIN = (() => {
  try { return new URL(MENU_API_BASE).origin; } catch { return MENU_API_BASE; }
})();

// NOTE: This compares core vs menu origins (kept for back-compat)
export const IS_SAME_ORIGIN = CORE_ORIGIN === MENU_ORIGIN;
// Prefer this for cookie-auth decisions: web origin vs core API origin
export const WEB_CORE_SAME_ORIGIN = WEB_SAME_ORIGIN;

/* ======================================
   AUTH TOKEN HELPERS (shared)
====================================== */
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("gk_token", token);
    else localStorage.removeItem("gk_token");
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    const t = localStorage.getItem("gk_token");
    if (t) authToken = t;
  }
  return authToken;
}

/* ======================================
   AXIOS FACTORY + INTERCEPTORS
====================================== */
function createClient(baseURL: string) {
  const instance = axios.create({
    baseURL,
    withCredentials: true, // keep cookie support
    timeout: 15_000,
  });

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = getAuthToken();
    if (token) {
      const current = config.headers;
      const headers =
        current instanceof AxiosHeaders ? current : new AxiosHeaders(current ?? {});
      headers.set("Authorization", `Bearer ${token}`);
      config.headers = headers;
    }
    return config;
  });

  instance.interceptors.response.use(
    (r) => r,
    (err: AxiosError<any>) => {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        const e = new Error("unauthorized") as any;
        e.status = status;
        throw e;
      }
      throw err;
    }
  );

  return instance;
}

/* ======================================
   EXPORTED CLIENTS
====================================== */
export const api = createClient(API_BASE);
export const menuApi = createClient(MENU_API_BASE);

/* ======================================
   ERROR HELPERS
====================================== */
export function parseError(err: any, fallback = "Request failed.") {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    (typeof err?.response?.data?.detail === "string" ? err.response.data.detail : "") ||
    err?.message ||
    fallback
  );
}

/* ======================================
   AUTH
====================================== */
export type LoginResponse =
  | { ok: true; token?: string }
  | { ok?: undefined; error?: string };

export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  if ((data as any)?.token) setAuthToken((data as any).token);
  return data as LoginResponse;
}
export async function logout() {
  const { data } = await api.post("/auth/logout");
  setAuthToken(null);
  return data as { ok: true } | { ok?: undefined; error?: string };
}
export async function me() {
  const { data } = await api.get("/auth/me");
  return data as { ok: true; user: { id: number; email: string } };
}

/* ======================================
   EMPLOYEES
====================================== */
export type Employee = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  baseSalary?: number | null;
  createdAt: string;
  type?: string | null;
  tableCode?: string | null;
  active?: boolean | null;
};

export type EmployeesQuery = {
  page?: number;
  limit?: number;
  q?: string;
  role?: string;
};

export type EmployeesResponse = {
  ok: true;
  page: number;
  limit: number;
  total: number;
  employees: Employee[];
};

export type CreateEmployeeInput = {
  name: string;
  role: string; // e.g. "CHEF" | "WAITER" | "CASHIER" | "MANAGER"
  type: "INSIDE" | "FIELD" | "KITCHEN";
  tableCode?: string | null;
  phone?: string | null;
  salaryMonthly: number;
  active?: boolean;
};

export async function createEmployee(input: CreateEmployeeInput) {
  const payload = {
    ...input,
    salaryMonthly: input.salaryMonthly.toFixed(2),
    tableCode: input.tableCode ?? null,
    phone: input.phone ?? null,
    active: input.active ?? true,
  };
  const { data } = await api.post("/employees", payload);
  return data;
}

export type UpdateEmployeeInput = CreateEmployeeInput;

export async function updateEmployee(id: string | number, input: UpdateEmployeeInput) {
  const payload = {
    ...input,
    salaryMonthly: input.salaryMonthly.toFixed(2),
    tableCode: input.tableCode ?? null,
    phone: input.phone ?? null,
    active: input.active ?? true,
  };
  try {
    const { data } = await api.put(`/employees/${String(id)}`, payload);
    return data as { ok?: true; employee?: any } | any;
  } catch (err: any) {
    const e = new Error(parseError(err, "Failed to update employee."));
    (e as any).status = err?.response?.status;
    throw e;
  }
}

/** deleteEmployee — tolerant to both 204 and 200 {mode} */
export async function deleteEmployee(id: string | number) {
  try {
    const res = await api.delete(`/employees/${String(id)}`);
    if (res.status === 204) {
      return { ok: true as const, mode: "hard" as const };
    }
    const mode =
      res.data && (res.data.mode === "hard" || res.data.mode === "soft")
        ? (res.data.mode as "hard" | "soft")
        : ("hard" as const);
    return { ok: true as const, mode };
  } catch (err: any) {
    const e = new Error(parseError(err, "Failed to delete employee."));
    (e as any).status = err?.response?.status;
    throw e;
  }
}

/* ======================================
   FIELD EMPLOYEES (adapter over /api/employees)
====================================== */
export async function listEmployees(params: EmployeesQuery = {}): Promise<EmployeesResponse> {
  const { q, limit = 50 } = params;
  const { data } = await api.get("/employees", {
  params: { type: "FIELD", active: true, q, limit },
});


  const employeesRaw = (data?.employees ?? []) as any[];
  const employees: Employee[] = employeesRaw.map((e) => ({
    id: e.id,
    name: e.name,
    phone: e.phone ?? null,
    role: e.role ?? null,
    type: e.type ?? null,
    active: e.active ?? true,
    baseSalary: (e as any).salaryMonthly ? Number((e as any).salaryMonthly) : null,
    tableCode: (e as any).tableCode ?? null,
    email: (e as any).email ?? null,
    createdAt: (e as any).createdAt ?? "",
  }));

  return {
    ok: true as const,
    page: 1,
    limit,
    total: employees.length,
    employees,
  };
}

/* ======================================
   SALARY DEDUCTIONS — WIRED
====================================== */
export type SalaryDeductionReason = "ADVANCE" | "BREAKAGE" | "LOSS" | "OTHER";

export type SalaryDeduction = {
  meta: string;
  id: number;
  employeeId: number;
  amount: number;
  reason: SalaryDeductionReason;
  note?: string | null;
  date: string;
  createdAt: string;
};

export type SalaryDeductionListResponse = {
  ok: boolean;
  items: SalaryDeduction[];
  total?: number;
  page?: number;
  pageSize?: number;
};

export type CreateSalaryDeductionInput = {
  employeeId: number;
  amount: number;                 // KES
  reason: SalaryDeductionReason;
  note?: string;
  date?: string;                  // optional ISO; backend defaults to now()
};

export type ListSalaryDeductionsQuery = {
  employeeId?: number;
  reason?: SalaryDeductionReason;
  from?: string;                  // YYYY-MM-DD
  to?: string;                    // YYYY-MM-DD
  page?: number;                  // default 1
  pageSize?: number;              // default 20
};

export async function createSalaryDeduction(input: CreateSalaryDeductionInput): Promise<SalaryDeduction> {
  try {
    const payload = {
      employeeId: input.employeeId,
      amount: input.amount.toFixed(2), // Decimal-safe
      reason: input.reason,
      note: input.note ?? undefined,
      ...(input.date ? { date: input.date } : {}),
    };
    const { data } = await api.post("salary-deductions", payload);
    const d = data?.deduction ?? data;
    return {
      id: d.id,
      employeeId: d.employeeId,
      amount: Number(d.amount),
      reason: d.reason,
      note: d.note ?? null,
      date: d.date,
      createdAt: d.createdAt,
    } as SalaryDeduction;
  } catch (err: any) {
    const e = new Error(parseError(err, "Failed to create salary deduction."));
    (e as any).status = err?.response?.status;
    throw e;
  }
}

export async function listSalaryDeductions(params: ListSalaryDeductionsQuery = {}): Promise<SalaryDeductionListResponse> {
  try {
    const { data } = await api.get("salary-deductions", {
      params: {
        employeeId: params.employeeId,
        reason: params.reason,
        from: params.from,
        to: params.to,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
      },
    });

    const items: SalaryDeduction[] = (data?.items ?? []).map((d: any) => ({
      id: d.id,
      employeeId: d.employeeId,
      amount: Number(d.amount),
      reason: d.reason,
      note: d.note ?? null,
      date: d.date,
      createdAt: d.createdAt,
    }));

    return {
      ok: true,
      items,
      total: data?.total ?? items.length,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? items.length,
    };
  } catch (err: any) {
    const e = new Error(parseError(err, "Failed to list salary deductions."));
    (e as any).status = err?.response?.status;
    throw e;
  }
}

/* ======================================
   MENU ITEMS (for Field Dispatch UI)
====================================== */
export type MenuItemLite = {
  id: number;
  name: string;
  category?: string | null;
  unit: string;
  priceSell: number;
  active: boolean;
};

/** GET /api/menu-items */
export async function listMenuItems(params?: { q?: string; active?: boolean; limit?: number }): Promise<MenuItemLite[]> {
  const { q, active = true, limit = 50 } = params ?? {};
  const { data } = await api.get("menu-items", {
    params: { q, active, limit },
  });
  // The route returns { ok, items }. Normalize to MenuItemLite[]
  return (data?.items ?? []).map((m: any) => ({
    id: m.id,
    name: m.name,
    category: m.category ?? null,
    unit: m.unit,
    priceSell: Number(m.priceSell),
    active: Boolean(m.active),
  })) as MenuItemLite[];
}

/* ======================================
   FIELD DISPATCH (create, list, get, return)
   - Mirrors backend routes we built
====================================== */
export type FieldReturnDTO = {
  id: number;
  dispatchId: number;
  qtyReturned: number;
  lossQty: number;
  cashCollected: number;
  note?: string | null;
  createdAt: string;
};

export type FieldDispatchDTO = {
  id: number;
  date: string;
  waiterId: number;
  itemId: number;
  qtyDispatched: number;
  priceEach: number;
  createdAt: string;
  waiter?: { id: number; name: string; phone?: string | null; type?: string } | null;
  item?: { id: number; name: string; unit: string } | null;
  return?: FieldReturnDTO | null;
};

export type FieldDispatchComputed = {
  hasReturn: boolean;
  grossSales: number;
  // populated when return exists:
  qtyReturned?: number;
  lossQty?: number;
  soldQty?: number;
  soldAmount?: number;
  cashCollected?: number;
  commission?: number;
};

export type CreateFieldDispatchInput = {
  waiterId: number;
  itemId: number;
  qtyDispatched: number;
  priceEach: number;
  date?: string; // ISO; server uses now() if omitted
};

export type FieldDispatchCreateResponse = {
  ok: boolean;
  dispatch: FieldDispatchDTO;
};

export async function createFieldDispatch(input: CreateFieldDispatchInput): Promise<FieldDispatchDTO> {
  const payload = {
    waiterId: input.waiterId,
    itemId: input.itemId,
    qtyDispatched: input.qtyDispatched.toFixed(2),
    priceEach: input.priceEach.toFixed(2),
    ...(input.date ? { date: input.date } : {}),
  };
  const { data } = await api.post("field-dispatch", payload);
  const d = data?.dispatch ?? data;
  return {
    id: d.id,
    date: d.date,
    waiterId: d.waiterId,
    itemId: d.itemId,
    qtyDispatched: Number(d.qtyDispatched),
    priceEach: Number(d.priceEach),
    createdAt: d.createdAt,
    waiter: d.waiter ?? null,
    item: d.item
      ? { id: d.item.id, name: d.item.name, unit: d.item.unit }
      : null,
    return: d.return
      ? {
          id: d.return.id,
          dispatchId: d.return.dispatchId,
          qtyReturned: Number(d.return.qtyReturned),
          lossQty: Number(d.return.lossQty),
          cashCollected: Number(d.return.cashCollected),
          note: d.return.note ?? null,
          createdAt: d.return.createdAt,
        }
      : null,
  };
}

export type FieldDispatchGetResponse = {
  ok: boolean;
  dispatch: FieldDispatchDTO;
  computed?: FieldDispatchComputed;
};

/** GET /api/field-dispatch/:id */
export async function getFieldDispatch(id: number): Promise<FieldDispatchGetResponse> {
  const { data } = await api.get(`/api/field-dispatch/${id}`);
  const d = data?.dispatch ?? data;
  // Keep `computed` as-is from server to avoid client-side drift
  return {
    ok: Boolean(data?.ok ?? true),
    dispatch: {
      id: d.id,
      date: d.date,
      waiterId: d.waiterId,
      itemId: d.itemId,
      qtyDispatched: Number(d.qtyDispatched),
      priceEach: Number(d.priceEach),
      createdAt: d.createdAt,
      waiter: d.waiter ?? null,
      item: d.item ? { id: d.item.id, name: d.item.name, unit: d.item.unit } : null,
      return: d.return
        ? {
            id: d.return.id,
            dispatchId: d.return.dispatchId,
            qtyReturned: Number(d.return.qtyReturned),
            lossQty: Number(d.return.lossQty),
            cashCollected: Number(d.return.cashCollected),
            note: d.return.note ?? null,
            createdAt: d.return.createdAt,
          }
        : null,
    },
    computed: data?.computed,
  };
}

export type ListFieldDispatchesQuery = {
  date: string;         // YYYY-MM-DD (required)
  waiterId?: number;    // optional
};

export type FieldDispatchListItem = FieldDispatchDTO & { computed?: FieldDispatchComputed };

export async function listFieldDispatches(params: ListFieldDispatchesQuery): Promise<FieldDispatchListItem[]> {
  if (!params?.date) throw new Error("date is required (YYYY-MM-DD)");
  const { data } = await api.get("field-dispatch", {
    params: { date: params.date, waiterId: params.waiterId },
  });

  const rows = (data?.dispatches ?? []) as any[];
  return rows.map((d) => ({
    id: d.id,
    date: d.date,
    waiterId: d.waiterId,
    itemId: d.itemId,
    qtyDispatched: Number(d.qtyDispatched),
    priceEach: Number(d.priceEach),
    createdAt: d.createdAt,
    waiter: d.waiter ?? null,
    item: d.item ? { id: d.item.id, name: d.item.name, unit: d.item.unit } : null,
    return: d.return
      ? {
          id: d.return.id,
          dispatchId: d.return.dispatchId,
          qtyReturned: Number(d.return.qtyReturned),
          lossQty: Number(d.return.lossQty),
          cashCollected: Number(d.return.cashCollected),
          note: d.return.note ?? null,
          createdAt: d.return.createdAt,
        }
      : null,
    computed: d.computed,
  })) as FieldDispatchListItem[];
}

export type ReturnFieldDispatchInput = {
  qtyReturned: number;
  lossQty?: number;
  cashCollected: number;
  note?: string;
};

export type ReturnFieldDispatchResponse = {
  ok: boolean;
  fieldReturn: FieldReturnDTO;
  computed: {
    qtyDispatched: number;
    priceEach: number;
    grossSales: number;
    qtyReturned: number;
    lossQty: number;
    soldQty: number;
    soldAmount: number;
    cashCollected: number;
    commission: number;
  };
};

/** POST /api/field-dispatch/:id/return */
export async function returnFieldDispatch(id: number, input: ReturnFieldDispatchInput): Promise<ReturnFieldDispatchResponse> {
  const payload = {
    qtyReturned: input.qtyReturned.toFixed(2),
    lossQty: (input.lossQty ?? 0).toFixed(2),
    cashCollected: input.cashCollected.toFixed(2),
    note: input.note ?? undefined,
  };
  const { data } = await api.post(`/api/field-dispatch/${id}/return`, payload);
  // Normalize decimals to numbers
  const fr = data?.fieldReturn ?? data;
  const computed = data?.computed ?? {};
  return {
    ok: Boolean(data?.ok ?? true),
    fieldReturn: {
      id: fr.id,
      dispatchId: fr.dispatchId,
      qtyReturned: Number(fr.qtyReturned),
      lossQty: Number(fr.lossQty),
      cashCollected: Number(fr.cashCollected),
      note: fr.note ?? null,
      createdAt: fr.createdAt,
    },
    computed: {
      qtyDispatched: Number(computed.qtyDispatched),
      priceEach: Number(computed.priceEach),
      grossSales: Number(computed.grossSales),
      qtyReturned: Number(computed.qtyReturned),
      lossQty: Number(computed.lossQty),
      soldQty: Number(computed.soldQty),
      soldAmount: Number(computed.soldAmount),
      cashCollected: Number(computed.cashCollected),
      commission: Number(computed.commission),
    },
  };
}

/* ======================================
   PAYROLL (IMPLEMENTED)
====================================== */
export type PayrollLine = {
  id: number;
  employeeId: number;
  gross: number;
  deductionsApplied: number;
  carryForward: number;
  netPay: number;
  note?: string | null;
  createdAt: string;
};

export type PayrollRun = {
  id: number;
  periodYear: number;
  periodMonth: number;
  runAt: string;
  createdAt?: string;
  updatedAt?: string;
  lineCount?: number;
  totals?: {
    gross: number;
    deductionsApplied: number;
    carryForward: number;
    netPay: number;
  };
  lines?: PayrollLine[]; // present when includeLines=true or from run endpoint
};

export type PayrollListQuery = {
  year?: number;
  month?: number;       // 1..12
  page?: number;        // default 1
  pageSize?: number;    // default 20
  includeLines?: boolean; // default false
};

export type PayrollListResponse = {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  runs: PayrollRun[];
};

export async function listPayroll(params: PayrollListQuery = {}): Promise<PayrollListResponse> {
  const { data } = await api.get("payroll", {
    params: {
      year: params.year,
      month: params.month,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      includeLines: params.includeLines ?? false,
    },
  });

  // Normalize numeric fields in lines if present
  const runs: PayrollRun[] = (data?.runs ?? []).map((r: any) => ({
    id: r.id,
    periodYear: r.periodYear,
    periodMonth: r.periodMonth,
    runAt: r.runAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lineCount: r.lineCount,
    totals: r.totals
      ? {
          gross: Number(r.totals.gross),
          deductionsApplied: Number(r.totals.deductionsApplied),
          carryForward: Number(r.totals.carryForward),
          netPay: Number(r.totals.netPay),
        }
      : undefined,
    lines: Array.isArray(r.lines)
      ? r.lines.map((L: any) => ({
          id: L.id,
          employeeId: L.employeeId,
          gross: Number(L.gross),
          deductionsApplied: Number(L.deductionsApplied),
          carryForward: Number(L.carryForward),
          netPay: Number(L.netPay),
          note: L.note ?? null,
          createdAt: L.createdAt,
        }))
      : undefined,
  }));

  return {
    ok: Boolean(data?.ok ?? true),
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? runs.length,
    total: data?.total ?? runs.length,
    runs,
  };
}

export async function runPayroll(ym: { year: number; month: number; overwrite?: boolean }): Promise<PayrollRun> {
  try {
    const { data } = await api.post("payroll/run", undefined, {
      params: {
        year: ym.year,
        month: ym.month,
        overwrite: ym.overwrite ? "true" : "false",
      },
    });

    const run = data?.run ?? data;
    return {
      id: run.id,
      periodYear: run.periodYear,
      periodMonth: run.periodMonth,
      runAt: run.runAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      lines: Array.isArray(run.lines)
        ? run.lines.map((L: any) => ({
            id: L.id,
            employeeId: L.employeeId,
            gross: Number(L.gross),
            deductionsApplied: Number(L.deductionsApplied),
            carryForward: Number(L.carryForward),
            netPay: Number(L.netPay),
            note: L.note ?? null,
            createdAt: L.createdAt,
          }))
        : undefined,
    };
  } catch (err: any) {
    const e = new Error(parseError(err, "Failed to run payroll."));
    (e as any).status = err?.response?.status;
    throw e;
  }
}

export async function getPayrollByYm(ym: { year: number; month: number }): Promise<PayrollRun> {
  // Use the list endpoint with includeLines=true and pick the (year, month) run
  const res = await listPayroll({ year: ym.year, month: ym.month, includeLines: true, page: 1, pageSize: 1 });
  const run = res.runs?.[0];
  if (!run) {
    const e = new Error("Payroll run not found for given year/month");
    (e as any).status = 404;
    throw e;
  }
  return run;
}


