// File: apps/web/app/admin/daily-history/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';

// If you moved AdminNav to a shared file, change the import path accordingly.
// Example: import AdminNav from '@/src/components/AdminNav';
import AdminNav from '@/src/components/AdminNav'; // safe fallback — update path if needed

// Normalize API base to always include trailing /api
const RAW_BASE = process.env.NEXT_PUBLIC_CORE_API || 'http://localhost:4000/api';
const API_BASE = /\/api\/?$/.test(RAW_BASE) ? RAW_BASE.replace(/\/$/, '') : `${RAW_BASE.replace(/\/$/, '')}/api`;

type ShiftSnapshot = any;

type EmployeeDailyRow = {
  employeeId: number;
  name: string;
  role: string | null;
  type: string | null;
  inside?: { dailySales: number; commission: number };
  field?: { cashCollected: number; commission: number };
  shiftSnapshot?: ShiftSnapshot | null;
};

type ApiResponse = { date: string; items: EmployeeDailyRow[] };

function money(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString(undefined, { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
}

function csvEscape(v: any) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function DailyHistoryPage() {
  // auth token
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const t = localStorage.getItem('adminJWT');
    if (t) setToken(t);
  }, []);

  // selected date (default today)
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateISO, setDateISO] = useState<string>(todayIso);

  // data + UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);

  // grouped lists
  const insideList = useMemo(() => (data?.items ?? []).filter(i => (i.type ?? '').toUpperCase() === 'INSIDE'), [data]);
  const fieldList  = useMemo(() => (data?.items ?? []).filter(i => (i.type ?? '').toUpperCase() === 'FIELD'), [data]);

  // totals
  const totals = useMemo(() => {
    let insideComm = 0, insideSales = 0, fieldComm = 0, fieldCash = 0;
    (data?.items ?? []).forEach((it) => {
      insideComm += Number(it.inside?.commission ?? 0);
      insideSales += Number(it.inside?.dailySales ?? 0);
      fieldComm += Number(it.field?.commission ?? 0);
      fieldCash += Number(it.field?.cashCollected ?? 0);
    });
    return { insideComm, insideSales, fieldComm, fieldCash };
  }, [data]);

  // fetch function
  async function fetchDaily(date: string) {
    if (!token) { setError('Not authenticated'); return; }
    setLoading(true); setError(null);
    try {
      const url = `${API_BASE}/reports/employee/daily?date=${encodeURIComponent(date)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const json = await res.json() as ApiResponse;
      // defensive normalization
      json.items = Array.isArray(json.items) ? json.items.map((it:any) => ({
        employeeId: Number(it.employeeId || it.id || 0),
        name: String(it.name || ''),
        role: it.role ?? null,
        type: it.type ?? null,
        inside: it.inside ? { dailySales: Number(it.inside.dailySales ?? 0), commission: Number(it.inside.commission ?? 0) } : { dailySales: 0, commission: 0 },
        field: it.field ? { cashCollected: Number(it.field.cashCollected ?? 0), commission: Number(it.field.commission ?? 0) } : { cashCollected: 0, commission: 0 },
        shiftSnapshot: it.shiftSnapshot ?? null,
      })) : [];
      setData(json);
    } catch (e: any) {
      console.error('fetchDaily error', e);
      setError(e?.message || 'Failed to load data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    // load once on mount or when token present
    fetchDaily(dateISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // handlers
  function onRefresh() { fetchDaily(dateISO); }

  function exportCsv() {
    if (!data) return;
    const headers = ['date','employeeId','name','role','type','inside_dailySales','inside_commission','field_cashCollected','field_commission','shiftSnapshot'];
    const rows = [headers.join(',')];
    data.items.forEach(it => {
      rows.push([
        csvEscape(data.date),
        csvEscape(it.employeeId),
        csvEscape(it.name),
        csvEscape(it.role),
        csvEscape(it.type),
        csvEscape(it.inside?.dailySales ?? 0),
        csvEscape(it.inside?.commission ?? 0),
        csvEscape(it.field?.cashCollected ?? 0),
        csvEscape(it.field?.commission ?? 0),
        csvEscape(it.shiftSnapshot ?? ''),
      ].join(','));
    });
    const blob = new Blob([`\uFEFF${rows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const filename = `employee_daily_${dateISO}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  if (!token) {
    return (
      <div className="min-h-screen p-6 grid place-items-center">
        <div className="max-w-md text-center space-y-4">
          <div className="text-lg font-medium">Daily History</div>
          <div className="text-sm text-zinc-600">Please log in at <a className="underline" href="/admin">/admin</a> first.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* shared nav */}
      <AdminNav />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Daily History</h1>
        <div className="text-xs text-zinc-500">Server: {API_BASE}</div>
      </div>

      <div className="rounded-2xl border p-4 bg-white/50 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Date</span>
              <input type="date" value={dateISO} onChange={(e)=>setDateISO(e.target.value)} className="border rounded-lg px-3 py-2" />
            </label>
            <button onClick={() => fetchDaily(dateISO)} disabled={loading} className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50">
              {loading ? 'Loading…' : 'Load'}
            </button>
            <button onClick={onRefresh} disabled={loading} className="rounded-lg px-4 py-2 border">Refresh</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={!data} className="rounded-lg px-3 py-1.5 border text-sm">Export CSV</button>
            {data && <div className="text-xs text-zinc-500">Date: {data.date} · {data.items.length} rows</div>}
          </div>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Totals card */}
          <div className="rounded-xl border p-3 bg-white">
            <div className="text-xs text-zinc-500">Summary</div>
            <div className="text-lg font-semibold">{money(totals.insideComm + totals.fieldComm)}</div>
            <div className="text-[11px] text-zinc-500">Inside Comm: {money(totals.insideComm)} · Field Comm: {money(totals.fieldComm)}</div>
            <div className="text-[11px] text-zinc-500 mt-2">Inside Sales Today: {money(totals.insideSales)} · Field Cash Today: {money(totals.fieldCash)}</div>
          </div>

          {/* Counts card */}
          <div className="rounded-xl border p-3 bg-white">
            <div className="text-xs text-zinc-500">Employee Counts</div>
            <div className="text-lg font-semibold">{(data?.items.length ?? 0)}</div>
            <div className="text-[11px] text-zinc-500 mt-1">Inside: {insideList.length} · Field: {fieldList.length}</div>
          </div>
        </div>
      </div>

      {/* INSIDE list */}
      <div className="rounded-2xl border overflow-hidden">
        <div className="p-4 border-b bg-white/60 flex items-center justify-between">
          <div className="font-medium">Inside Staff ({insideList.length})</div>
          <div className="text-xs text-zinc-500">Daily sales & applied commission snapshot</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Sales (KES)</th>
                <th className="text-left p-3">Commission (KES)</th>
                <th className="text-left p-3">Shift Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {insideList.map(it => (
                <tr key={it.employeeId} className="odd:bg-white even:bg-zinc-50 align-top">
                  <td className="p-3">{it.employeeId}</td>
                  <td className="p-3 font-medium">{it.name}</td>
                  <td className="p-3">{it.role ?? '—'}</td>
                  <td className="p-3">{money(it.inside?.dailySales ?? 0)}</td>
                  <td className="p-3">{money(it.inside?.commission ?? 0)}</td>
                  <td className="p-3 text-xs text-zinc-700 max-w-[300px]">
                    <pre className="whitespace-pre-wrap break-words text-[12px]">{JSON.stringify(it.shiftSnapshot ?? {}, null, 2)}</pre>
                  </td>
                </tr>
              ))}
              {insideList.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-sm text-zinc-500">No inside staff for this date.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FIELD list */}
      <div className="rounded-2xl border overflow-hidden">
        <div className="p-4 border-b bg-white/60 flex items-center justify-between">
          <div className="font-medium">Field Staff ({fieldList.length})</div>
          <div className="text-xs text-zinc-500">Dispatched cash & applied commission snapshot</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Cash Collected (KES)</th>
                <th className="text-left p-3">Commission (KES)</th>
                <th className="text-left p-3">Shift Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {fieldList.map(it => (
                <tr key={it.employeeId} className="odd:bg-white even:bg-zinc-50 align-top">
                  <td className="p-3">{it.employeeId}</td>
                  <td className="p-3 font-medium">{it.name}</td>
                  <td className="p-3">{it.role ?? '—'}</td>
                  <td className="p-3">{money(it.field?.cashCollected ?? 0)}</td>
                  <td className="p-3">{money(it.field?.commission ?? 0)}</td>
                  <td className="p-3 text-xs text-zinc-700 max-w-[300px]">
                    <pre className="whitespace-pre-wrap break-words text-[12px]">{JSON.stringify(it.shiftSnapshot ?? {}, null, 2)}</pre>
                  </td>
                </tr>
              ))}
              {fieldList.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-sm text-zinc-500">No field staff for this date.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
