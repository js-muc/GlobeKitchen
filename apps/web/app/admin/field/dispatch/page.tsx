'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { makeApi } from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/fieldEndpoints';
import { fetchAllEmployees, type EmployeeLite } from '@/lib/employeeClient';

type MenuItemLite = { id: number; name: string; price?: number | null };

// Payload expected by backend
type DispatchCreateBody = {
  waiterId: number;
  items: Array<{ itemId: number; qtyDispatched: number; priceEach: number }>;
  note?: string | null;
};

type Row = { key: string; itemId: number; priceEach: number; qty: number };

const fmtKES = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;

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

export default function FieldDispatchPage() {
  /* -------------------- auth + api -------------------- */
  const [token, setToken] = useState<string | null>(null);
  const api = useMemo(() => makeApi(token || undefined), [token]);
  useEffect(() => { const t = localStorage.getItem('adminJWT'); if (t) setToken(t); }, []);

  /* -------------------- employees -------------------- */
  const [emps, setEmps] = useState<EmployeeLite[]>([]);
  const [busyEmps, setBusyEmps] = useState(false);
  const [errEmps, setErrEmps] = useState<string | null>(null);
  const [empQuery, setEmpQuery] = useState('');

  /* -------------------- items -------------------- */
  const [menuItems, setMenuItems] = useState<MenuItemLite[]>([]);
  const [busyItems, setBusyItems] = useState(false);
  const [errItems, setErrItems] = useState<string | null>(null);

  /* -------------------- form -------------------- */
  const [waiterId, setWaiterId] = useState<number | ''>('');
  const [note, setNote] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([{ key: crypto.randomUUID(), itemId: 0, priceEach: 0, qty: 1 }]);

  const [busyCreate, setBusyCreate] = useState(false);
  const [msgCreate, setMsgCreate] = useState<string | null>(null);

  /* ==================== LOADERS ==================== */

  // Employees (FIELD only)
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

  // Menu items: use /menu-items → { items: [{ id, name, priceSell, ... }] }
  useEffect(() => {
    async function loadMenuItems() {
      setBusyItems(true); setErrItems(null);
      try {
        if (!token) return;
        const resp = await api.get<any>(ENDPOINTS.menuItemsQuick);
        const raw: any[] = Array.isArray(resp) ? resp : (Array.isArray(resp?.items) ? resp.items : []);
        const normalized: MenuItemLite[] = raw.map((x: any) => ({
          id: Number(x.id),
          name: String(x.name ?? x.title ?? x.label ?? x.itemName ?? `#${x.id}`),
          // your Prisma model uses priceSell
          price: x.priceSell != null
            ? Number(x.priceSell)
            : (x.price != null ? Number(x.price) : (x.priceEach != null ? Number(x.priceEach) : null)),
        })).sort((a,b) => a.name.localeCompare(b.name));
        setMenuItems(normalized);
      } catch (e: any) {
        setErrItems(e?.message || 'Failed to load items');
      } finally { setBusyItems(false); }
    }
    loadMenuItems();
  }, [api, token]);

  /* ==================== HELPERS ==================== */

  const filteredEmps = empQuery
    ? emps.filter(e => e.name.toLowerCase().includes(empQuery.toLowerCase()))
    : emps;

  function addLine() {
    setRows(prev => [...prev, { key: crypto.randomUUID(), itemId: 0, priceEach: 0, qty: 1 }]);
  }
  function removeLine(key: string) {
    setRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r.key !== key)));
  }

  const lineTotal = (r: Row) => (Number(r.qty || 0) * Number(r.priceEach || 0));
  const grandTotal = rows.reduce((sum, r) => sum + lineTotal(r), 0);

  const validRows = rows
    .map(r => ({
      itemId: Number(r.itemId),
      qty: Number(r.qty),
      priceEach: Number(r.priceEach),
    }))
    .filter(r => r.itemId && r.qty > 0 && Number.isFinite(r.priceEach));

  const canSubmit = !!waiterId && validRows.length > 0;

  /* ==================== SUBMIT ==================== */


type DispatchCreateBodySingle = {
  waiterId: number;
  itemId: number;
  qtyDispatched: number;
  priceEach: number;
  note?: string | null;
};

async function createDispatch() {
  if (!token) { setMsgCreate('Please log in first.'); return; }

  // keep only valid rows
  const valid = rows
    .map(r => ({
      itemId: Number(r.itemId),
      qty: Number(r.qty),
      price: Number(r.priceEach),
      key: r.key,
    }))
    .filter(r => Number.isFinite(r.itemId) && r.itemId > 0
              && Number.isFinite(r.qty) && r.qty > 0
              && Number.isFinite(r.price) && r.price >= 0);

  if (valid.length === 0 || !waiterId) {
    setMsgCreate('Please choose a waiter and add at least one valid line.');
    return;
  }

  setBusyCreate(true);
  setMsgCreate(null);

  try {
    // The API expects ONE dispatch row per call → fire them sequentially
    const createdIds: number[] = [];

    for (const v of valid) {
      const payload: DispatchCreateBodySingle = {
        waiterId: Number(waiterId),
        itemId: v.itemId,
        qtyDispatched: v.qty,
        priceEach: v.price,
        note: note || null,
      };

      // POST /api/field-dispatch
      const resp = await api.post<any>(ENDPOINTS.dispatchCreate, payload);
      if (resp?.id) createdIds.push(Number(resp.id));
    }

    setMsgCreate(
      createdIds.length
        ? `Dispatch created: ${createdIds.length} line(s) (IDs: ${createdIds.join(', ')})`
        : 'Dispatch created.'
    );

    // reset form
    setRows([{ key: crypto.randomUUID(), itemId: 0, priceEach: 0, qty: 1 }]);
    setNote('');
  } catch (e: any) {
    // show the most helpful server message available
    const raw = e?.message || '';
    setMsgCreate(raw || 'Failed to create dispatch');
  } finally {
    setBusyCreate(false);
  }
}



  /* ==================== RENDER ==================== */

  return (
    <div className="p-6 space-y-6">
      <AdminNav />

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-bold">Field Dispatch</h1>
        {!token && <div className="text-xs text-zinc-500">Please log in at <Link className="underline" href="/admin">/admin</Link>.</div>}
      </div>

      {/* Waiter */}
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
              disabled={!token || busyEmps}
            />
          </label>
          <label className="flex flex-col md:col-span-3">
            <span className="text-xs text-zinc-500">Employee (FIELD)</span>
            <select
              className="border rounded-lg px-3 py-2"
              value={waiterId as any}
              onChange={(e)=> setWaiterId(e.target.value ? Number(e.target.value) : '')}
              disabled={!token || busyEmps}
            >
              <option value="">Select employee…</option>
              {filteredEmps.map(e => (<option key={e.id} value={e.id}>{e.name} (#{e.id})</option>))}
            </select>
          </label>
          <div className="text-sm text-zinc-600 md:col-span-1">{busyEmps ? 'Loading…' : errEmps}</div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-2xl border p-4 space-y-3 bg-white/50">
        <div className="font-medium">Items to Dispatch</div>

        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl border bg-white p-2">
              {/* Item select */}
              <div className="md:col-span-6">
                <select
                  className="border rounded-lg px-3 py-2 w-full"
                  value={r.itemId || ''}
                  onChange={(e) => {
                    const itemId = Number(e.target.value);
                    const found = menuItems.find(mi => mi.id === itemId);
                    const priceEach = Number(found?.price ?? 0);
                    setRows(prev => prev.map(p => p.key === r.key ? { ...p, itemId, priceEach } : p));
                  }}
                  disabled={!token || busyItems}
                >
                  <option value="">Select item…</option>
                  {menuItems.map(mi => (
                    <option key={mi.id} value={mi.id}>
                      {mi.name}{mi.price != null ? ` — ${fmtKES(mi.price)}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* PriceEach */}
              <div className="md:col-span-2">
                <div className="text-xs text-zinc-500 mb-1">Price</div>
                <input
                  type="number"
                  className="border rounded-lg px-3 py-2 w-full"
                  placeholder="0"
                  value={r.priceEach}
                  min={0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setRows(prev => prev.map(p => p.key === r.key ? { ...p, priceEach: v } : p));
                  }}
                />
              </div>

              {/* Qty */}
              <div className="md:col-span-2">
                <div className="text-xs text-zinc-500 mb-1">Qty</div>
                <input
                  type="number"
                  className="border rounded-lg px-3 py-2 w-full"
                  value={r.qty}
                  min={1}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setRows(prev => prev.map(p => p.key === r.key ? { ...p, qty: v } : p));
                  }}
                />
              </div>

              {/* Line total */}
              <div className="md:col-span-1 grid content-end">
                <div className="text-xs text-zinc-500">Total</div>
                <div className="font-medium">{fmtKES(lineTotal(r))}</div>
              </div>

              {/* Remove */}
              <div className="md:col-span-1 grid content-end">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 w-full"
                  onClick={() => removeLine(r.key)}
                  disabled={rows.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between">
            <button type="button" className="rounded-lg border px-3 py-2" onClick={addLine}>
              Add Line
            </button>
            <div className="text-right">
              <div className="text-xs text-zinc-500">Grand Total</div>
              <div className="text-lg font-semibold">{fmtKES(grandTotal)}</div>
            </div>
          </div>
        </div>

        <label className="flex flex-col">
          <span className="text-xs text-zinc-500">Note</span>
          <textarea className="border rounded-lg px-3 py-2" value={note} onChange={e=>setNote(e.target.value)} />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={createDispatch}
            disabled={!token || busyCreate || !canSubmit}
            className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50"
          >
            {busyCreate ? 'Saving…' : 'Create Dispatch'}
          </button>
          {msgCreate && <div className="text-sm text-zinc-600">{msgCreate}</div>}
          <div className="text-sm text-zinc-500">{busyItems ? 'Loading items…' : errItems}</div>
        </div>
      </div>
    </div>
  );
}
