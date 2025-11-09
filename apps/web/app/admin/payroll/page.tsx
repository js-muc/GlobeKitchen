'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { makeApi, API_BASE } from '@/src/lib/apiClient';
import type { ApiClient } from '@/src/lib/apiClient';
import AdminNav from '@/src/components/AdminNav';
import { InsideCell, FieldCell } from '@/src/components/PreviewCells';

// Types (kept aligned with previous logic)
interface PageMeta { total: number; page: number; limit: number; pages: number; hasNext: boolean; hasPrev: boolean; }
interface PayrollRunRow { id: number; periodYear: number; periodMonth: number; runAt: string; createdAt: string; totals?: any; lineCount?: number; lines?: any[]; }
interface PayrollListResp { data: PayrollRunRow[]; meta: PageMeta; }
interface LineRow { id: number; employeeId: number; gross: number; deductionsApplied: number; carryForward: number; netPay: number; note: string | null; createdAt: string; }
interface RunWithLines { id: number; periodYear: number; periodMonth: number; runAt: string; createdAt: string; lines: LineRow[]; }
interface EmployeeLite { id: number; name: string; role?: string; type?: string; }
interface InsidePreview { shiftId: number | null; dailySales: number; commission: number; nextTarget: null | { target: number; earns: number }; }
interface FieldPreview { dateISO: string; waiterId: number; cashCollected: number; commission: number; nextTarget: null | { target: number; earns: number }; }

export default function PayrollAdminPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { const t = localStorage.getItem('adminJWT'); if (t) setToken(t); }, []);
  const api = useMemo(() => makeApi(token || undefined), [token]);

  // period + runs list
  const [year, setYear] = useState<number>(new Date().getUTCFullYear());
  const [month, setMonth] = useState<number>(new Date().getUTCMonth() + 1);
  const [runs, setRuns] = useState<PayrollRunRow[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [busyList, setBusyList] = useState(false);
  const [errList, setErrList] = useState<string | null>(null);

  async function loadList(page = 1) {
    if (!token) return;
    setBusyList(true); setErrList(null);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '20', year: String(year), month: String(month) });
      const data = await api.get<PayrollListResp>(`/payroll?${qs.toString()}`);
      setRuns(data.data); setMeta(data.meta);
    } catch (e: any) { setErrList(e?.message || 'Failed to load runs'); }
    finally { setBusyList(false); }
  }
  useEffect(() => { loadList(1); }, [token, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // employee map
  const [empMap, setEmpMap] = useState<Record<number, EmployeeLite>>({});
  const [busyEmp, setBusyEmp] = useState(false);
  const [empErr, setEmpErr] = useState<string | null>(null);
  useEffect(() => {
    async function loadEmployees() {
      if (!token) return;
      setBusyEmp(true); setEmpErr(null);
      try {
        const list = await api.get<EmployeeLite[]>(`/employees`);
        const map: Record<number, EmployeeLite> = {};
        list.forEach((e) => { map[e.id] = e; });
        setEmpMap(map);
      } catch (e: any) { setEmpErr(e?.message || 'Emp load failed'); }
      finally { setBusyEmp(false); }
    }
    loadEmployees();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // helper to extract useful error text from API errors
  function parseApiError(e: any) {
    try {
      if (!e) return 'Unknown error';
      // common shapes (axios-like)
      if (e.response && e.response.data) {
        if (typeof e.response.data === 'string') return e.response.data;
        if (e.response.data.error) return String(e.response.data.error);
        if (e.response.data.message) return String(e.response.data.message);
        return JSON.stringify(e.response.data);
      }
      // fetch-like where message might contain body
      if (e.message) return e.message;
      return String(e);
    } catch (err) {
      return String(err);
    }
  }

  // run/rerun
  const [busyRun, setBusyRun] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  async function runPayroll(overwrite: boolean) {
    if (!token) return;
    setBusyRun(true); setRunMsg(null);
    try {
      const qs = new URLSearchParams({ year: String(year), month: String(month), overwrite: String(overwrite) });
      const res = await api.post<RunWithLines & { lines?: LineRow[] }>(`/payroll/run?${qs.toString()}`);
      const linesCount = (res.lines?.length ?? 0);
      setRunMsg(`Run #${res.id} created with ${linesCount} lines`);
      await loadList(1);
      await selectRun(res.periodYear, res.periodMonth);
      // notify other pages/tabs
      window.dispatchEvent(new Event('commission:changed'));
    } catch (err: any) {
      const text = parseApiError(err);

      // If server responded with 409 (already exists), and we didn't ask to overwrite,
      // offer a confirmation to overwrite (UI-friendly fallback).
      const status = err?.response?.status ?? err?.status ?? null;
      if ((status === 409 || /exist/i.test(text)) && !overwrite) {
        const confirmOverwrite = window.confirm(
          `A payroll run already exists for ${year}-${month}. Do you want to overwrite it?`);
        if (confirmOverwrite) {
          // re-run with overwrite=true
          try {
            await runPayroll(true);
            return;
          } catch (e) {
            setRunMsg(parseApiError(e));
            return;
          }
        }
        setRunMsg('Run cancelled by user (existing payroll).');
      } else {
        setRunMsg(text || 'Run failed');
      }
    } finally {
      setBusyRun(false);
    }
  }

  // details pane
  const [selected, setSelected] = useState<RunWithLines | null>(null);
  const [busyDetail, setBusyDetail] = useState(false);
  const [errDetail, setErrDetail] = useState<string | null>(null);
  async function selectRun(y: number, m: number) {
    if (!token) return;
    setBusyDetail(true); setErrDetail(null);
    try {
      const data = await api.get<RunWithLines>(`/payroll/${y}-${m}`);
      setSelected(data);
    } catch (e: any) { setErrDetail(e?.message || 'Failed to load run'); }
    finally { setBusyDetail(false); }
  }

  function empLabel(id: number) {
    const e = empMap[id];
    if (!e) return `#${id}`;
    const metaBits: string[] = [];
    if (e.role)  metaBits.push(e.role);
    if (e.type)  metaBits.push(e.type);
    return (
      <div className="leading-tight">
        <div className="font-medium">{e.name}</div>
        {metaBits.length > 0 && <div className="text-[11px] text-zinc-500">{metaBits.join(' · ')}</div>}
      </div>
    );
  }

  // Inside/Field preview helpers same as before (we reuse shared components)
  const [previewEmpId, setPreviewEmpId] = useState<number | ''>('');
  const [prevBusy, setPrevBusy] = useState(false);
  const [prevErr, setPrevErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<InsidePreview | null>(null);

  async function loadInsidePreview() {
    if (!previewEmpId) return;
    setPrevBusy(true); setPrevErr(null); setPreview(null);
    try {
      const data = await api.get<InsidePreview>(`/commission/inside/today/${previewEmpId}`);
      setPreview(data);
    } catch (e: any) {
      setPrevErr(e?.message || 'Failed to fetch preview');
    } finally {
      setPrevBusy(false);
    }
  }

  const [fieldEmpId, setFieldEmpId] = useState<number | ''>('');
  const [fieldBusy, setFieldBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [fieldPrev, setFieldPrev] = useState<FieldPreview | null>(null);

  async function loadFieldPreview() {
    if (!fieldEmpId) return;
    setFieldBusy(true); setFieldErr(null); setFieldPrev(null);
    try {
      const data = await api.get<FieldPreview>(`/commission/field/today/${fieldEmpId}`);
      setFieldPrev(data);
    } catch (e: any) {
      setFieldErr(e?.message || 'Failed to fetch field preview');
    } finally {
      setFieldBusy(false);
    }
  }

  async function applyFieldCommission() {
    if (!fieldEmpId) return;
    try {
      await api.post('/commission/field/apply', { waiterId: fieldEmpId });
      await loadFieldPreview();
      window.dispatchEvent(new Event('commission:changed'));
      alert('Field commission applied to today’s shift (if present).');
    } catch (e: any) {
      alert(e?.message || 'Failed to apply field commission');
    }
  }

  // totals summary (keeps original logic)
  const [sumBusy, setSumBusy] = useState(false);
  const [sumErr, setSumErr] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [sumInsideCommission, setSumInsideCommission] = useState<number>(0);
  const [sumInsideSales, setSumInsideSales] = useState<number>(0);
  const [sumFieldCommission, setSumFieldCommission] = useState<number>(0);
  const [sumFieldCash, setSumFieldCash] = useState<number>(0);

  async function refreshTodayTotals() {
    setSumBusy(true); setSumErr(null);
    try {
      let insideComm = 0, insideSales = 0;
      let fieldComm = 0, fieldCash = 0;

      // load employees short list to iterate
      const list = await api.get<EmployeeLite[]>(`/employees`);
      const inside = list.filter(e => (e.type||'').toUpperCase() === 'INSIDE');
      const field = list.filter(e => (e.type||'').toUpperCase() === 'FIELD');

      const insideTasks = inside.map(async (e) => {
        try {
          const d = await api.get<InsidePreview>(`/commission/inside/today/${e.id}`);
          insideComm += Number(d?.commission || 0);
          insideSales += Number(d?.dailySales || 0);
        } catch {}
      });
      const fieldTasks = field.map(async (e) => {
        try {
          const d = await api.get<FieldPreview>(`/commission/field/today/${e.id}`);
          fieldComm += Number(d?.commission || 0);
          fieldCash += Number(d?.cashCollected || 0);
        } catch {}
      });

      await Promise.allSettled([...insideTasks, ...fieldTasks]);

      setSumInsideCommission(insideComm);
      setSumInsideSales(insideSales);
      setSumFieldCommission(fieldComm);
      setSumFieldCash(fieldCash);
      setLastRefreshed(new Date().toLocaleString());
    } catch (e: any) {
      setSumErr(e?.message || 'Failed to compute totals');
    } finally {
      setSumBusy(false);
    }
  }

  useEffect(() => {
    // refresh totals once employees loaded
    refreshTodayTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!token) {
    return (
      <div className="min-h-screen p-6 grid place-items-center">
        <div className="text-sm text-zinc-600">Please log in at <a className="underline" href="/admin">/admin</a> first.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <AdminNav />
      <div className="flex gap-3 items-center justify-between">
        <h1 className="text-2xl font-bold">Payroll</h1>
        <div className="text-xs text-zinc-500">Server: {API_BASE}</div>
      </div>

      {/* Today's commission summary */}
      <div className="rounded-2xl border p-4 bg-white/50 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium">Today’s Commission Summary</div>
          <div className="flex items-center gap-2">
            {lastRefreshed && <div className="text-xs text-zinc-500">Last updated: {lastRefreshed}</div>}
            <button onClick={refreshTodayTotals} disabled={sumBusy} className="rounded-lg px-3 py-1.5 border text-sm disabled:opacity-50">
              {sumBusy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border p-3 bg-white">
            <div className="text-xs text-zinc-500">Inside Commission (KES)</div>
            <div className="text-lg font-semibold">{sumInsideCommission.toLocaleString()}</div>
            <div className="text-[11px] text-zinc-500">Sales Today: KES {sumInsideSales.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border p-3 bg-white">
            <div className="text-xs text-zinc-500">Field Commission (KES)</div>
            <div className="text-lg font-semibold">{sumFieldCommission.toLocaleString()}</div>
            <div className="text-[11px] text-zinc-500">Cash Today: KES {sumFieldCash.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border p-3 bg-white">
            <div className="text-xs text-zinc-500">Total Commission (KES)</div>
            <div className="text-lg font-semibold">{(sumInsideCommission + sumFieldCommission).toLocaleString()}</div>
            <div className="text-[11px] text-zinc-500">Across Inside + Field</div>
          </div>
          <div className="rounded-xl border p-3 bg-white">
            <div className="text-xs text-zinc-500">Employees Count</div>
            <div className="text-lg font-semibold">{/* compute on-demand */}</div>
            <div className="text-[11px] text-zinc-500">Inside / Field counts shown in Employees page</div>
          </div>
        </div>
      </div>

      {/* Run Controls */}
      <div className="rounded-2xl border p-4 space-y-3 bg-white/50">
        <div className="font-medium">Run Payroll (Commission Only)</div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <label className="flex flex-col">
            <span className="text-xs text-zinc-500">Year</span>
            <input type="number" className="border rounded-lg px-3 py-2" value={year} onChange={(e)=>setYear(Number(e.target.value))} />
          </label>
          <label className="flex flex-col">
            <span className="text-xs text-zinc-500">Month</span>
            <input type="number" className="border rounded-lg px-3 py-2" value={month} onChange={(e)=>setMonth(Number(e.target.value))} />
          </label>
          <div className="flex gap-2 col-span-2 md:col-span-2">
            <button onClick={()=>runPayroll(false)} disabled={busyRun} className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50">Run</button>
            <button onClick={()=>{
              if (!confirm(`This will overwrite any existing payroll for ${year}-${month}. Continue?`)) return;
              runPayroll(true);
            }} disabled={busyRun} className="rounded-lg px-4 py-2 border">Run & Rerun</button>
          </div>
          {runMsg && <div className="text-sm text-zinc-600 md:col-span-2">{runMsg}</div>}
        </div>
      </div>

      {/* Inside Daily Commission Preview */}
      <div className="rounded-2xl border p-4 space-y-3 bg-white/50">
        <div className="font-medium flex items-center justify-between gap-3 flex-wrap">
          <span>Inside Daily Commission — Today</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="flex flex-col">
            <span className="text-xs text-zinc-500">Employee (INSIDE)</span>
            <select className="border rounded-lg px-3 py-2" value={previewEmpId as any} onChange={(e)=> setPreviewEmpId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select employee…</option>
              {Object.values(empMap).filter(e=> (e.type||'').toUpperCase()==='INSIDE').map(e => (<option key={e.id} value={e.id}>{e.name} (#{e.id})</option>))}
            </select>
          </label>
          <div className="flex gap-2">
            <button onClick={loadInsidePreview} disabled={!previewEmpId || prevBusy} className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50">Preview</button>
            <button onClick={()=>{ setPreview(null); setPrevErr(null); }} className="rounded-lg px-4 py-2 border">Clear</button>
          </div>
          <div className="text-sm text-zinc-600">{prevBusy ? 'Fetching…' : prevErr}</div>
        </div>

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border p-3 bg-white">
                <div className="text-xs text-zinc-500">Shift</div>
                <div className="text-lg font-semibold">{preview.shiftId ?? '—'}</div>
              </div>
              <div className="rounded-xl border p-3 bg-white">
                <div className="text-xs text-zinc-500">Daily Sales</div>
                <div className="text-lg font-semibold">KES {preview.dailySales.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border p-3 bg-white">
                <div className="text-xs text-zinc-500">Commission</div>
                <div className="text-lg font-semibold">KES {preview.commission.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border p-3 bg-white">
                <div className="text-xs text-zinc-500">Next Target</div>
                <div className="text-lg font-semibold">
                  {preview.nextTarget ? `KES ${preview.nextTarget.target.toLocaleString()} → Earns KES ${preview.nextTarget.earns.toLocaleString()}` : '—'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={async () => {
                if (!preview?.shiftId) return alert('No shift to apply to. Ensure the waiter has an INSIDE shift opened today.');
                try {
                  await api.post(`/commission/inside/apply/${preview.shiftId}`);
                  await loadInsidePreview();
                  window.dispatchEvent(new Event('commission:changed'));
                  alert('Applied inside commission to shift.');
                } catch (e: any) {
                  alert(e?.message || 'Failed to apply');
                }
              }} className="rounded-lg px-4 py-2 bg-emerald-600 text-white">Apply to Shift</button>
              <div className="text-xs text-zinc-500">
                {(!preview.shiftId) && 'No active shift found for today.'}
                {(preview.shiftId && preview.commission <= 0) && 'No commission for current bracket.'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Field Cash Preview */}
      <div className="rounded-2xl border p-4 space-y-3 bg-white/50">
        <div className="font-medium">Field Cash — Today</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="flex flex-col">
            <span className="text-xs text-zinc-500">Employee (FIELD)</span>
            <select className="border rounded-lg px-3 py-2" value={fieldEmpId as any} onChange={(e)=> setFieldEmpId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select employee…</option>
              {Object.values(empMap).filter(e=> (e.type||'').toUpperCase()==='FIELD').map(e => (<option key={e.id} value={e.id}>{e.name} (#{e.id})</option>))}
            </select>
          </label>
          <div className="flex gap-2">
            <button onClick={loadFieldPreview} disabled={!fieldEmpId || fieldBusy} className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50">Preview</button>
            <button onClick={()=>{ setFieldPrev(null); setFieldErr(null); }} className="rounded-lg px-4 py-2 border">Clear</button>
          </div>
          <div className="text-sm text-zinc-600">{fieldBusy ? 'Fetching…' : fieldErr}</div>
        </div>

        {fieldPrev && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border p-3 bg-white">
                <div className="text-xs text-zinc-500">Date</div>
                <div className="text-lg font-semibold">{fieldPrev.dateISO}</div>
              </div>
              <div className="rounded-xl border p-3 bg-white">
                <div className="text-xs text-zinc-500">Cash Collected</div>
                <div className="text-lg font-semibold">KES {fieldPrev.cashCollected.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border p-3 bg-white">
                <div className="text-xs text-zinc-500">Commission</div>
                <div className="text-lg font-semibold">KES {fieldPrev.commission.toLocaleString()}</div>
              </div>
              <div className="rounded-xl border p-3 bg-white">
                <div className="text-xs text-zinc-500">Next Target</div>
                <div className="text-lg font-semibold">
                  {fieldPrev.nextTarget ? `KES ${fieldPrev.nextTarget.target.toLocaleString()} → Earns KES ${fieldPrev.nextTarget.earns.toLocaleString()}` : '—'}
                </div>
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <button onClick={applyFieldCommission} disabled={!fieldEmpId || (fieldPrev.commission ?? 0) <= 0} className="rounded-lg px-4 py-2 bg-emerald-600 text-white disabled:opacity-50">Apply to Shift (FIELD)</button>
              <span className="text-xs text-zinc-500">Stores the field commission in the waiter’s ShiftCashup snapshot for today.</span>
            </div>
          </div>
        )}
      </div>

      {/* Runs list + details */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* List */}
        <div className="rounded-2xl border overflow-hidden">
          <div className="p-4 border-b bg-white/60 flex items-center justify-between">
            <div className="font-medium">Runs</div>
            <button onClick={()=>loadList(meta?.page || 1)} className="border rounded-lg px-3 py-1.5 text-sm">Refresh</button>
          </div>
          {busyList ? (
            <div className="p-6 text-sm text-zinc-500">Loading…</div>
          ) : errList ? (
            <div className="p-6 text-sm text-red-600">{errList}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left p-3">ID</th>
                    <th className="text-left p-3">Period</th>
                    <th className="text-left p-3">Run At</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="odd:bg-white even:bg-zinc-50">
                      <td className="p-3">{r.id}</td>
                      <td className="p-3">{r.periodYear}-{r.periodMonth}</td>
                      <td className="p-3">{new Date(r.runAt).toLocaleString()}</td>
                      <td className="p-3">
                        <button className="px-3 py-1.5 rounded border" onClick={()=>selectRun(r.periodYear, r.periodMonth)}>View Lines</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {meta && (
                <div className="p-3 flex flex-wrap items-center gap-2 border-t text-sm">
                  <button className="border rounded px-2 py-1" disabled={!meta.hasPrev} onClick={()=>loadList((meta.page||1)-1)}>Prev</button>
                  <div>Page {meta.page} / {meta.pages}</div>
                  <button className="border rounded px-2 py-1" disabled={!meta.hasNext} onClick={()=>loadList((meta.page||1)+1)}>Next</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="rounded-2xl border overflow-hidden">
          <div className="p-4 border-b bg-white/60 flex flex-wrap gap-2 items-center justify-between">
            <div className="font-medium">Run Details</div>
            <div className="flex items-center gap-2">
              <button onClick={() => {
                if (!selected) return;
                const headers = ['runId','periodYear','periodMonth','runAt','lineId','employeeId','employeeName','role','type','gross','deductionsApplied','carryForward','netPay','note','lineCreatedAt'];
                const rows = [headers.join(',')];
                selected.lines.forEach(l => {
                  const emp = empMap[l.employeeId];
                  const rec = [
                    selected.id,
                    selected.periodYear,
                    selected.periodMonth,
                    new Date(selected.runAt).toISOString(),
                    l.id,
                    l.employeeId,
                    emp?.name || `#${l.employeeId}`,
                    emp?.role || '',
                    emp?.type || '',
                    l.gross,
                    l.deductionsApplied,
                    l.carryForward,
                    l.netPay,
                    l.note ?? '',
                    new Date(l.createdAt).toISOString(),
                  ].map(v => {
                    if (v == null) return '';
                    const s = String(v);
                    if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
                    return s;
                  }).join(',');
                  rows.push(rec);
                });
                const blob = new Blob(["\uFEFF" + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
                const filename = `payroll_${selected.periodYear}-${selected.periodMonth}_run-${selected.id}.csv`;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = filename; a.style.display = 'none'; document.body.appendChild(a); a.click();
                setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
              }} disabled={!selected} className="px-3 py-1.5 rounded border text-sm disabled:opacity-50">Export CSV</button>
              {selected && (
                <div className="text-xs text-zinc-500">{selected.periodYear}-{selected.periodMonth} · {selected.lines.length} lines</div>
              )}
            </div>
          </div>
          {busyDetail ? (
            <div className="p-6 text-sm text-zinc-500">Loading…</div>
          ) : errDetail ? (
            <div className="p-6 text-sm text-red-600">{errDetail}</div>
          ) : !selected ? (
            <div className="p-6 text-sm text-zinc-500">Select a run to view lines.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left p-3">Line ID</th>
                    <th className="text-left p-3">Employee</th>
                    <th className="text-left p-3">Gross (KES)</th>
                    <th className="text-left p-3">Deductions</th>
                    <th className="text-left p-3">Carry Fwd</th>
                    <th className="text-left p-3">Net Pay</th>
                    <th className="text-left p-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((l)=> (
                    <tr key={l.id} className="odd:bg-white even:bg-zinc-50 align-top">
                      <td className="p-3">{l.id}</td>
                      <td className="p-3 min-w-[180px]">{empLabel(l.employeeId)}</td>
                      <td className="p-3 whitespace-nowrap">{l.gross}</td>
                      <td className="p-3 whitespace-nowrap">{l.deductionsApplied}</td>
                      <td className="p-3 whitespace-nowrap">{l.carryForward}</td>
                      <td className="p-3 font-medium whitespace-nowrap">{l.netPay}</td>
                      <td className="p-3 text-zinc-600">{l.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(busyEmp || empErr) && (
                <div className="p-3 text-xs text-zinc-500 border-t">{busyEmp ? 'Loading employee names…' : empErr}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
