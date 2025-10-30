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

/* …rest of original file unchanged… */
