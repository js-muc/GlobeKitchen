// apps/web/app/admin/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from "react";
import { makeApi } from '@/src/lib/apiClient';
import AdminNav from '@/src/components/AdminNav';
import { InsideCell, FieldCell } from '@/src/components/PreviewCells';

// Types (kept light & same semantics)
interface Overview {
  ok: boolean;
  now: string;
  employeesCount: number;
  menuItemsCount: number;
  stockMovementsToday: number;
  stockMovementsMonth: number;
  payroll: { runsLast90d: number; lastRun: { id: number; createdAt: string } | null };
}
interface EmployeeRow {
  id: number; name: string; role: string; type: string;
  tableCode: string | null; phone: string | null; active: boolean; createdAt: string;
}

// Simple money formatter
function money(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString(undefined, { style: "currency", currency: "KES", maximumFractionDigits: 2 });
}

/* ---------------------- LoginCard (unchanged behaviour) ---------------------- */
function LoginCard({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("Admin#123");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${(process.env.NEXT_PUBLIC_CORE_API || "http://localhost:4000/api").replace(/\/$/, "")}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const token = json?.token as string;
      if (!token) throw new Error("No token returned");
      localStorage.setItem("adminJWT", token);
      onLoggedIn(token);
    } catch (e: any) { setErr(e?.message || "Login failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-md mx-auto rounded-2xl border p-6 bg-white/70 dark:bg-zinc-900 space-y-4">
      <div className="text-lg font-semibold">Admin Login</div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Email</span>
        <input className="border rounded-lg px-3 py-2" value={email} onChange={e=>setEmail(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Password</span>
        <input type="password" className="border rounded-lg px-3 py-2" value={password} onChange={e=>setPassword(e.target.value)} />
      </label>
      {err ? <div className="text-sm text-red-600">{err}</div> : null}
      <button onClick={submit} disabled={busy} className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50 w-full">{busy? "Signing in…":"Sign in"}</button>
      <div className="text-xs text-zinc-500">API: {(process.env.NEXT_PUBLIC_CORE_API || "http://localhost:4000/api")}</div>
    </div>
  );
}

/* ---------------------- AdminApp (all admin hooks & UI) ---------------------- */
/**
 * This component contains all the hooks used by the admin UI. It is deliberately
 * separated from the top-level wrapper so we never conditionally call hooks.
 */
function AdminApp({ token, onLogout }: { token: string; onLogout: ()=>void }) {
  const api = useMemo(() => makeApi(token), [token]);

  // data
  const [overview, setOverview] = useState<Overview | null>(null);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // preview refresh tick for child cells
  const [tick, setTick] = useState(0);

  async function loadTop() {
    setLoading(true); setError(null);
    try {
      const [ov, emps] = await Promise.all([
        api.get<Overview>("/reports/overview"),
        api.get<EmployeeRow[]>("/employees"),
      ]);
      setOverview(ov); setEmployees(emps);
    } catch (e: any) { setError(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadTop(); }, [api]); // load on mount and whenever token/api changes

  // listen for cross-tab (or same-tab) commission updates
  useEffect(() => {
    function onCommissionChanged() {
      loadTop();
      setTick(t => t + 1);
    }
    window.addEventListener('commission:changed', onCommissionChanged);
    return () => window.removeEventListener('commission:changed', onCommissionChanged);
  }, [api]);

  // payroll controls (kept but simple)
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  async function runPayroll() {
    setRunMsg(null); setRunning(true);
    try {
      const qs = new URLSearchParams({ year: String(year), month: String(month), rerun: "true" }).toString();
      const r = await api.post<{ id: number; lines?: any[] }>(`/payroll/run?${qs}`);
      const count = Array.isArray((r as any)?.lines) ? (r as any).lines.length : 0;
      setRunMsg(`Run #${(r as any).id} created with ${count} lines.`);
      await loadTop();
      window.dispatchEvent(new Event('commission:changed'));
    } catch (e: any) { setRunMsg(e?.message || "Run failed"); }
    finally { setRunning(false); }
  }

  function logout() {
    localStorage.removeItem("adminJWT");
    onLogout();
  }

  // split employees into inside / field (UI improvement)
  const insideEmployees = employees.filter(e => (e.type || '').toUpperCase() === 'INSIDE');
  const fieldEmployees  = employees.filter(e => (e.type || '').toUpperCase() === 'FIELD');

  return (
    <div className="p-6 space-y-6">
      <AdminNav />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => { loadTop(); setTick(t => t + 1); }} className="rounded-lg px-3 py-1.5 border text-sm">
            Refresh Previews
          </button>
          <a className="text-sm underline text-blue-600" href={`${(process.env.NEXT_PUBLIC_CORE_API || "http://localhost:4000/api")}/docs`} target="_blank" rel="noreferrer">Open API Docs</a>
          <button onClick={logout} className="rounded-lg px-3 py-1.5 border">Logout</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <div className="rounded-2xl border p-4 shadow-sm bg-white/50 dark:bg-zinc-900">Loading…</div>
        ) : error ? (
          <div className="rounded-2xl border p-4 shadow-sm bg-white/50 dark:bg-zinc-900 text-red-600">{error}</div>
        ) : overview ? (
          <>
            <div className="rounded-2xl border p-4 shadow-sm bg-white/50 dark:bg-zinc-900">
              <div className="text-sm text-zinc-500">Employees</div>
              <div className="text-2xl font-semibold mt-1">{overview.employeesCount}</div>
            </div>
            <div className="rounded-2xl border p-4 shadow-sm bg-white/50 dark:bg-zinc-900">
              <div className="text-sm text-zinc-500">Menu Items</div>
              <div className="text-2xl font-semibold mt-1">{overview.menuItemsCount}</div>
            </div>
            <div className="rounded-2xl border p-4 shadow-sm bg-white/50 dark:bg-zinc-900">
              <div className="text-sm text-zinc-500">Stock Moves (Today)</div>
              <div className="text-2xl font-semibold mt-1">{overview.stockMovementsToday}</div>
            </div>
            <div className="rounded-2xl border p-4 shadow-sm bg-white/50 dark:bg-zinc-900">
              <div className="text-sm text-zinc-500">Payroll Runs (90d)</div>
              <div className="text-2xl font-semibold mt-1">{overview.payroll.runsLast90d}</div>
              <div className="text-xs text-zinc-500 mt-1">{overview.payroll.lastRun ? `Last: ${new Date(overview.payroll.lastRun.createdAt).toLocaleString()}` : 'No recent run'}</div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border p-4 shadow-sm bg-white/50 dark:bg-zinc-900">No data</div>
        )}
      </div>

      {/* Employees — split into two columns: Inside / Field */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border overflow-hidden">
          <div className="p-4 border-b bg-white/60 flex items-center justify-between">
            <div className="font-medium">Inside Employees (Live Preview)</div>
            <div className="text-xs text-zinc-500">Today (Inside)</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Table</th>
                  <th className="text-left p-3">Phone</th>
                  <th className="text-left p-3">Today (Inside)</th>
                </tr>
              </thead>
              <tbody>
                {insideEmployees.map(e => (
                  <tr key={e.id} className="odd:bg-white even:bg-zinc-50">
                    <td className="p-3">{e.id}</td>
                    <td className="p-3">{e.name}</td>
                    <td className="p-3">{e.role}</td>
                    <td className="p-3">{e.tableCode ?? '—'}</td>
                    <td className="p-3">{e.phone ?? '—'}</td>
                    <td className="p-3"><InsideCell id={e.id} api={api} tick={tick} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border overflow-hidden">
          <div className="p-4 border-b bg-white/60 flex items-center justify-between">
            <div className="font-medium">Field Employees (Live Preview)</div>
            <div className="text-xs text-zinc-500">Today (Field)</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Phone</th>
                  <th className="text-left p-3">Today (Field)</th>
                </tr>
              </thead>
              <tbody>
                {fieldEmployees.map(e => (
                  <tr key={e.id} className="odd:bg-white even:bg-zinc-50">
                    <td className="p-3">{e.id}</td>
                    <td className="p-3">{e.name}</td>
                    <td className="p-3">{e.role}</td>
                    <td className="p-3">{e.phone ?? '—'}</td>
                    <td className="p-3"><FieldCell id={e.id} api={api} tick={tick} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-500">Server: {(process.env.NEXT_PUBLIC_CORE_API || "http://localhost:4000/api")}</div>
    </div>
  );
}

/* ---------------------- Top-level Page component (wrapper) ---------------------- */
/**
 * AdminDashboardPage simply manages token and renders either login UI or AdminApp.
 * Splitting like this prevents hook-order mismatches and keeps the top-level file
 * lightweight and safe for hydration.
 */
export default function AdminDashboardPage() {
  const [token, setToken] = useState<string | null>(() => {
    try { return localStorage.getItem("adminJWT"); } catch { return null; }
  });

  useEffect(() => {
    // in case token is in localStorage after login on separate tab
    function onStorage(e: StorageEvent) {
      if (e.key === "adminJWT") setToken(e.newValue);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Render login screen if no token
  if (!token) {
    return (
      <div className="min-h-screen p-6 grid place-items-center">
        <LoginCard onLoggedIn={(t) => setToken(t)} />
      </div>
    );
  }

  return <AdminApp token={token} onLogout={() => setToken(null)} />;
}
