'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { makeApi } from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/fieldEndpoints';
import { fetchAllEmployees, type EmployeeLite } from '@/lib/employeeClient';

type DispatchLine = {
  id: number;                // dispatchId
  date: string;
  waiterId: number;
  itemId: number;
  itemName?: string;         // resolved from API or menu map
  qtyDispatched: number;
  priceEach: number;
  createdAt: string;
  returned?: boolean;        // if a FieldReturn exists
};

type ReturnInput = {
  qtyReturned: number;
  lossQty: number;
  cashCollected: number;
  shortCash: number;
  note: string;
};

const KES = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;

function AdminNav() {
  return (
    <nav className="sticky top-0 z-10 mb-6 bg-white/70 backdrop-blur border rounded-2xl p-2 flex flex-wrap items-center gap-2">
      <Link href="/admin" className="px-3 py-1.5 rounded-lg border">Dashboard</Link>
      <Link href="/admin/field" className="px-3 py-1.5 rounded-lg border bg-black text-white">Field Sales</Link>
      <Link href="/admin/field/dispatch" className="px-3 py-1.5 rounded-lg border">Dispatch</Link>
      <Link href="/admin/field/return" className="px-3 py-1.5 rounded-lg border">Return</Link>
    </nav>
  );
}

export default function FieldReturnPage() {
  /* -------------------- auth + api -------------------- */
  const [token, setToken] = useState<string | null>(null);
  const api = useMemo(() => makeApi(token || undefined), [token]);
  useEffect(() => { const t = localStorage.getItem('adminJWT'); if (t) setToken(t); }, []);

  /* -------------------- employees (FIELD only) -------------------- */
  const [emps, setEmps] = useState<EmployeeLite[]>([]);
  const [busyEmps, setBusyEmps] = useState(false);
  const [errEmps, setErrEmps] = useState<string | null>(null);
  const [empQuery, setEmpQuery] = useState('');
  const [waiterId, setWaiterId] = useState<number | ''>('');

  useEffect(() => {
    async function loadEmployees() {
      setBusyEmps(true); setErrEmps(null);
      try {
        if (!token) return;
        const list = await fetchAllEmployees(api, { type: 'FIELD' });
        const normalized = list.map(e => ({ ...e, type: e.type ?? undefined })) as EmployeeLite[];
        setEmps(normalized);
      } catch (e: any) {
        setErrEmps(e?.message || 'Failed to load employees');
      } finally { setBusyEmps(false); }
    }
    loadEmployees();
  }, [api, token]);

  const filteredEmps = empQuery
    ? emps.filter(e => e.name.toLowerCase().includes(empQuery.toLowerCase()))
    : emps;

  /* -------------------- menu items map (id -> name) -------------------- */
  const [menuNameById, setMenuNameById] = useState<Record<number, string>>({});
  useEffect(() => {
    async function loadMenuNames() {
      if (!token) return;
      try {
        const resp = await api.get<any>(ENDPOINTS.menuItemsQuick);
        const arr: any[] = Array.isArray(resp) ? resp : (Array.isArray(resp?.items) ? resp.items : []);
        const map: Record<number, string> = {};
        for (const x of arr) {
          const id = Number(x.id);
          const name = String(x.name ?? x.title ?? x.itemName ?? `#${id}`);
          map[id] = name;
        }
        setMenuNameById(map);
      } catch {
        // soft-fail; UI will show #id if name missing
      }
    }
    loadMenuNames();
  }, [api, token]);

  /* -------------------- today’s dispatch lines for this waiter -------------------- */
  const [lines, setLines] = useState<DispatchLine[]>([]);
  const [busyLines, setBusyLines] = useState(false);
  const [errLines, setErrLines] = useState<string | null>(null);

  const [form, setForm] = useState<Record<number, ReturnInput>>({});

  function todayISO(d = new Date()) {
    const dt = new Date(d); dt.setHours(0,0,0,0);
    return dt.toISOString().slice(0,10);
  }

  async function refreshLines(forWaiterId: number) {
    setBusyLines(true); setErrLines(null);
    try {
      const resp = await api.get<any>(ENDPOINTS.dispatchListToday(Number(forWaiterId)));
      const raw: any[] = Array.isArray(resp) ? resp : (Array.isArray(resp?.data) ? resp.data : []);
      const normalized: DispatchLine[] = raw.map((x: any) => {
        const id = Number(x.id);
        const itemId = Number(x.itemId);
        const nameFromApi = x.item?.name ?? x.itemName;
        const name = nameFromApi ?? menuNameById[itemId];
        return {
          id,
          date: String(x.date ?? todayISO()),
          waiterId: Number(x.waiterId),
          itemId,
          itemName: name,
          qtyDispatched: Number(x.qtyDispatched ?? x.qty ?? 0),
          priceEach: Number(x.priceEach ?? x.price ?? 0),
          createdAt: String(x.createdAt ?? new Date().toISOString()),
          returned: Boolean(x.return != null || x.returned),
        };
      });
      setLines(normalized);
      setForm(prev => {
        const n = { ...prev };
        for (const l of normalized) {
          if (!n[l.id]) n[l.id] = { qtyReturned: 0, lossQty: 0, cashCollected: 0, shortCash: 0, note: '' };
        }
        return n;
      });
    } catch (e: any) {
      setErrLines(e?.message || 'Failed to load today’s dispatches');
    } finally {
      setBusyLines(false);
    }
  }

  useEffect(() => {
    setLines([]); setErrLines(null);
    if (!token || !waiterId) return;
    refreshLines(Number(waiterId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, token, waiterId, menuNameById]); // re-map names when menu map arrives

  /* -------------------- helpers -------------------- */
  function computeQtySold(line: DispatchLine, f: ReturnInput) {
    const sold = Number(line.qtyDispatched) - Number(f.qtyReturned || 0) - Number(f.lossQty || 0);
    return sold < 0 ? 0 : sold;
  }
  function computeLineSales(line: DispatchLine, f: ReturnInput) {
    return computeQtySold(line, f) * Number(line.priceEach || 0);
  }
  function expectedCash(line: DispatchLine, f: ReturnInput) {
    return computeLineSales(line, f);
  }

  async function saveShortCashOnly(line: DispatchLine) {
    const f = form[line.id];
    if (!f || !f.shortCash || f.shortCash <= 0) return;
    try {
      await api.post(ENDPOINTS.salaryDeductions, {
        employeeId: Number(line.waiterId),
        amount: Number(f.shortCash),
        reason: "LOSS",
        note: `Short cash against dispatch #${line.id} (${line.itemName || 'item'})`,
      });
      alert('Short cash recorded.');
    } catch (e: any) {
      alert(e?.message || 'Failed to save short cash');
    }
  }

  async function saveReturn(line: DispatchLine) {
    const f = form[line.id];
    if (!f) return;

    // if already has a return: only allow short-cash-only helper
    if (line.returned) {
      if (f.shortCash && f.shortCash > 0) {
        await saveShortCashOnly(line);
        return;
      }
      alert('Return already recorded for this item.');
      return;
    }

    // basic validation
    if (f.qtyReturned < 0 || f.lossQty < 0 || f.cashCollected < 0 || f.shortCash < 0) {
      alert('Values cannot be negative.'); return;
    }
    const totalQty = Number(f.qtyReturned || 0) + Number(f.lossQty || 0);
    if (totalQty > line.qtyDispatched) {
      alert('Returned + Loss cannot exceed dispatched quantity.'); return;
    }

    try {
      // 1) Create FieldReturn
      await api.post(ENDPOINTS.returnCreateForDispatch(line.id), {
        qtyReturned: Number(f.qtyReturned || 0),
        lossQty: Number(f.lossQty || 0),
        cashCollected: Number(f.cashCollected || 0),
        note: f.note || null,
      });

      // 2) Optional short cash → SalaryDeduction
      if (f.shortCash && f.shortCash > 0) {
        await saveShortCashOnly(line);
      }

      // 3) Refresh lines
      await refreshLines(Number(waiterId));
    } catch (e: any) {
      const msg = `${e?.message ?? ''}`;
      if (msg.includes('duplicate_return')) {
        // mark as returned and continue
        setLines(prev => prev.map(l => l.id === line.id ? { ...l, returned: true } : l));
        alert('Return already exists. Marked as returned.');
        return;
      }
      alert(e?.message || 'Failed to save return');
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen p-6 grid place-items-center">
        <div className="text-sm text-zinc-600">Please log in at <Link className="underline" href="/admin">/admin</Link> first.</div>
      </div>
    );
  }

  /* -------------------- render -------------------- */
  return (
    <div className="p-6 space-y-6">
      <AdminNav />

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-bold">Field Return</h1>
        <div className="text-xs text-zinc-500">Date: {todayISO()}</div>
      </div>

      {/* Waiter selection (by name) */}
      <div className="rounded-2xl border p-4 space-y-3 bg-white/50">
        <div className="font-medium">Select Waiter</div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <label className="flex flex-col md:col-span-2">
            <span className="text-xs text-zinc-500">Search</span>
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Type to filter…"
              value={empQuery}
              onChange={(e)=> setEmpQuery(e.target.value)}
              disabled={busyEmps}
            />
          </label>
          <label className="flex flex-col md:col-span-3">
            <span className="text-xs text-zinc-500">Employee (FIELD)</span>
            <select
              className="border rounded-lg px-3 py-2"
              value={waiterId as any}
              onChange={(e)=> setWaiterId(e.target.value ? Number(e.target.value) : '')}
              disabled={busyEmps}
            >
              <option value="">Select employee…</option>
              {(empQuery ? filteredEmps : emps).map(e => (
                <option key={e.id} value={e.id}>{e.name} (#{e.id})</option>
              ))}
            </select>
          </label>
          <div className="text-sm text-zinc-600 md:col-span-1">{busyEmps ? 'Loading…' : errEmps}</div>
        </div>
      </div>

      {/* Dispatch lines */}
      <div className="rounded-2xl border p-4 space-y-3 bg-white/50">
        <div className="font-medium">Today’s Dispatches (per item)</div>

        {busyLines ? (
          <div className="text-sm text-zinc-500">Loading dispatch lines…</div>
        ) : errLines ? (
          <div className="text-sm text-red-600">{errLines}</div>
        ) : lines.length === 0 ? (
          <div className="text-sm text-zinc-500">No dispatches for today.</div>
        ) : (
          <div className="space-y-2">
            {lines.map((ln) => {
              const f = form[ln.id] ?? { qtyReturned: 0, lossQty: 0, cashCollected: 0, shortCash: 0, note: '' };
              const sold = computeQtySold(ln, f);
              const sales = computeLineSales(ln, f);
              const expCash = expectedCash(ln, f);
              const disabled = Boolean(ln.returned);

              return (
                <div key={ln.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl border bg-white p-3">
                  <div className="md:col-span-3">
                    <div className="text-xs text-zinc-500">Item</div>
                    <div className="font-medium">{ln.itemName || `#${ln.itemId}`}</div>
                    <div className="text-[11px] text-zinc-500">Dispatched: {ln.qtyDispatched}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-zinc-500">Price Each</div>
                    <div className="font-medium">{KES(ln.priceEach)}</div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs text-zinc-500">Qty Returned</label>
                    <input
                      type="number"
                      className="border rounded-lg px-3 py-2 w-full"
                      min={0}
                      max={ln.qtyDispatched}
                      value={f.qtyReturned}
                      onChange={(e)=> setForm(p => ({ ...p, [ln.id]: { ...p[ln.id], qtyReturned: Number(e.target.value) } }))}
                      disabled={disabled}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs text-zinc-500">Loss Qty</label>
                    <input
                      type="number"
                      className="border rounded-lg px-3 py-2 w-full"
                      min={0}
                      max={ln.qtyDispatched}
                      value={f.lossQty}
                      onChange={(e)=> setForm(p => ({ ...p, [ln.id]: { ...p[ln.id], lossQty: Number(e.target.value) } }))}
                      disabled={disabled}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="text-xs text-zinc-500">Cash Collected (KES)</label>
                    <input
                      type="number"
                      className="border rounded-lg px-3 py-2 w-full"
                      min={0}
                      value={f.cashCollected}
                      onChange={(e)=> setForm(p => ({ ...p, [ln.id]: { ...p[ln.id], cashCollected: Number(e.target.value) } }))}
                      disabled={disabled}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="text-xs text-zinc-500">Short Cash (KES)</label>
                    <input
                      type="number"
                      className="border rounded-lg px-3 py-2 w-full"
                      min={0}
                      value={f.shortCash}
                      onChange={(e)=> setForm(p => ({ ...p, [ln.id]: { ...p[ln.id], shortCash: Number(e.target.value) } }))}
                      disabled={false}
                    />
                    <div className="text-[11px] text-zinc-500">Creates a LOSS deduction</div>
                  </div>

                  <div className="md:col-span-5">
                    <label className="text-xs text-zinc-500">Note</label>
                    <input
                      className="border rounded-lg px-3 py-2 w-full"
                      value={f.note}
                      onChange={(e)=> setForm(p => ({ ...p, [ln.id]: { ...p[ln.id], note: e.target.value } }))}
                      disabled={disabled}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-zinc-500">Qty Sold</div>
                    <div className="font-medium">{sold}</div>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-zinc-500">Expected Cash</div>
                    <div className="font-semibold">{KES(expCash)}</div>
                  </div>

                  <div className="md:col-span-3 grid grid-cols-2 gap-2 content-end">
                    <button
                      type="button"
                      className="rounded-lg px-4 py-2 bg-emerald-600 text-white disabled:opacity-50"
                      onClick={()=> saveReturn(ln)}
                      disabled={!waiterId || disabled}
                    >
                      {disabled ? 'Returned' : 'Save Return'}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-4 py-2 border disabled:opacity-50"
                      onClick={()=> saveShortCashOnly(ln)}
                      disabled={!waiterId || !(form[ln.id]?.shortCash > 0)}
                    >
                      Save Short Cash
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
