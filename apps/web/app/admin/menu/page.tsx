'use client';

// apps/web/app/admin/menu/page.tsx
// Admin Menu Items CRUD (protected)
// - GET /api/items
// - POST /api/items { name, category, unit, priceSell, costUnit?, active? }
// - PUT  /api/items/:id
// - DELETE /api/items/:id
// Mirrors API field names exactly (priceSell is required by backend).

import React, { useEffect, useMemo, useState } from 'react';

const RAW_BASE = process.env.NEXT_PUBLIC_CORE_API || 'http://localhost:4000/api';
const API_BASE = /\/api\/?$/.test(RAW_BASE) ? RAW_BASE.replace(/\/$/, '') : `${RAW_BASE.replace(/\/$/, '')}/api`;

function makeApi(token?: string) {
  const baseHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  return {
    async get<T>(path: string): Promise<T> {
      const res = await fetch(`${API_BASE}${path}`, { headers: baseHeaders, cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    async post<T>(path: string, body?: any): Promise<T> {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    async put<T>(path: string, body?: any): Promise<T> {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...baseHeaders },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    async del(path: string): Promise<void> {
      const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: baseHeaders });
      if (!res.ok) throw new Error(await res.text());
    },
  };
}

// Light types aligned to API response
interface ItemRow {
  id: number;
  name: string;
  category: string; // e.g. "Hot Beverages", "Food", "snacks", "Materials", etc.
  unit: string;     // display unit (e.g. "1 Cup", "plate", "kg")
  priceSell: number; // required by API
  costUnit?: number | null;
  active: boolean;
  createdAt: string;
}

function FormInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }
) {
  const { label, className, ...rest } = props;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-zinc-500">{label}</span>
      <input {...rest} className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20 ${className||''}`} />
    </label>
  );
}

export default function MenuAdminPage() {
  // auth
  const [token, setToken] = useState<string | null>(null);
  const api = useMemo(() => makeApi(token || undefined), [token]);
  useEffect(() => { const t = localStorage.getItem('adminJWT'); if (t) setToken(t); }, []);

  // data
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true); setErr(null);
    try {
      const list = await api.get<ItemRow[]>('/items');
      setRows(list);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [token]);

  // create form
  const [cName, setCName] = useState('');
  const [cCategory, setCCategory] = useState('Hot Beverages');
  const [cUnit, setCUnit] = useState('1 Cup');
  const [cPriceSell, setCPriceSell] = useState<string>('0');
  const [cCostUnit, setCCostUnit] = useState<string>('');
  const [cActive, setCActive] = useState(true);
  const [busyCreate, setBusyCreate] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  function numOrNull(s: string): number | null {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  async function createItem() {
    if (!token) return;
    setBusyCreate(true); setCreateMsg(null);
    try {
      if (!cName.trim()) throw new Error('Name is required');
      const price = Number(cPriceSell);
      if (!Number.isFinite(price) || price < 0) throw new Error('priceSell must be a non-negative number');

      const body: any = {
        name: cName.trim(),
        category: cCategory.trim(),
        unit: cUnit.trim(),
        priceSell: price,
        active: cActive,
      };
      const cu = numOrNull(cCostUnit);
      if (cu !== null) body.costUnit = cu;

      const created = await api.post<ItemRow>('/items', body);
      setRows((r) => [...r, created]);
      setCreateMsg('Item created');
      setCName(''); setCCategory('Hot Beverages'); setCUnit('1 Cup'); setCPriceSell('0'); setCCostUnit(''); setCActive(true);
    } catch (e: any) {
      setCreateMsg(e?.message || 'Create failed');
    } finally { setBusyCreate(false); }
  }

  // edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Partial<ItemRow>>({});
  function startEdit(row: ItemRow) { setEditingId(row.id); setEdit({ ...row }); }
  function cancelEdit() { setEditingId(null); setEdit({}); }

  async function saveEdit() {
    if (!token || editingId == null) return;
    try {
      const payload: any = {
        name: edit.name?.trim(),
        category: edit.category?.trim(),
        unit: edit.unit?.trim(),
        priceSell: Number(edit.priceSell),
        active: Boolean(edit.active),
      };
      if (!Number.isFinite(payload.priceSell)) throw new Error('priceSell must be a number');
      if (edit.costUnit !== undefined) {
        const cu = Number(edit.costUnit);
        if (Number.isFinite(cu)) payload.costUnit = cu; else payload.costUnit = undefined;
      }
      const updated = await api.put<ItemRow>(`/items/${editingId}`, payload);
      setRows((r) => r.map((x) => (x.id === editingId ? updated : x)));
      cancelEdit();
    } catch (e: any) {
      alert(e?.message || 'Update failed');
    }
  }

  async function remove(id: number) {
    if (!token) return;
    if (!confirm('Delete this item? This action cannot be undone.')) return;
    try {
      await api.del(`/items/${id}`);
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen p-6 grid place-items-center">
        <div className="text-sm text-zinc-600">Please log in at <a className="underline" href="/admin">/admin</a> first.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Menu Items</h1>
        <div className="text-xs text-zinc-500">Server: {API_BASE}</div>
      </div>

      {/* Create */}
      <div className="rounded-2xl border p-4 space-y-3 bg-white/50 dark:bg-zinc-900">
        <div className="font-medium">Add Item</div>
        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
          <FormInput label="Name" value={cName} onChange={(e)=>setCName(e.target.value)} />
          <FormInput label="Category" value={cCategory} onChange={(e)=>setCCategory(e.target.value)} />
          <FormInput label="Unit" value={cUnit} onChange={(e)=>setCUnit(e.target.value)} />
          <FormInput label="Sell Price (priceSell)" type="number" value={cPriceSell} onChange={(e)=>setCPriceSell(e.target.value)} />
          <FormInput label="Cost (optional)" type="number" value={cCostUnit} onChange={(e)=>setCCostUnit(e.target.value)} />
          <label className="flex items-center gap-2 text-sm mt-6 md:mt-0">
            <input type="checkbox" checked={cActive} onChange={(e)=>setCActive(e.target.checked)} /> Active
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={createItem} disabled={busyCreate} className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50">{busyCreate? 'Saving…':'Create'}</button>
          {createMsg && <div className="text-sm text-zinc-600">{createMsg}</div>}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden">
        <div className="p-4 border-b bg-white/60 dark:bg-zinc-900 flex items-center justify-between">
          <div className="font-medium">All Items</div>
          <button onClick={load} className="border rounded-lg px-3 py-1.5 text-sm">Refresh</button>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-zinc-500">Loading…</div>
        ) : err ? (
          <div className="p-6 text-sm text-red-600">{err}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Unit</th>
                  <th className="text-left p-3">Sell Price</th>
                  <th className="text-left p-3">Cost</th>
                  <th className="text-left p-3">Active</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="odd:bg-white even:bg-zinc-50">
                    <td className="p-3">{r.id}</td>
                    <td className="p-3">
                      {editingId === r.id ? (
                        <input className="border rounded px-2 py-1 w-full" value={String(edit.name ?? '')} onChange={(e)=>setEdit((s)=>({ ...s, name: e.target.value }))} />
                      ) : r.name}
                    </td>
                    <td className="p-3">
                      {editingId === r.id ? (
                        <input className="border rounded px-2 py-1 w-full" value={String(edit.category ?? '')} onChange={(e)=>setEdit((s)=>({ ...s, category: e.target.value }))} />
                      ) : r.category}
                    </td>
                    <td className="p-3">
                      {editingId === r.id ? (
                        <input className="border rounded px-2 py-1 w-full" value={String(edit.unit ?? '')} onChange={(e)=>setEdit((s)=>({ ...s, unit: e.target.value }))} />
                      ) : r.unit}
                    </td>
                    <td className="p-3">
                      {editingId === r.id ? (
                        <input type="number" className="border rounded px-2 py-1 w-32" value={String(edit.priceSell ?? 0)} onChange={(e)=>setEdit((s)=>({ ...s, priceSell: Number(e.target.value) }))} />
                      ) : r.priceSell}
                    </td>
                    <td className="p-3">
                      {editingId === r.id ? (
                        <input type="number" className="border rounded px-2 py-1 w-32" value={String(edit.costUnit ?? '')} onChange={(e)=>setEdit((s)=>({ ...s, costUnit: e.target.value === '' ? undefined : Number(e.target.value) }))} />
                      ) : (r.costUnit ?? '—')}
                    </td>
                    <td className="p-3">
                      {editingId === r.id ? (
                        <input type="checkbox" checked={Boolean(edit.active)} onChange={(e)=>setEdit((s)=>({ ...s, active: e.target.checked }))} />
                      ) : (r.active ? 'Yes' : 'No')}
                    </td>
                    <td className="p-3 flex gap-2">
                      {editingId === r.id ? (
                        <>
                          <button onClick={saveEdit} className="px-3 py-1.5 rounded bg-black text-white">Save</button>
                          <button onClick={cancelEdit} className="px-3 py-1.5 rounded border">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>startEdit(r)} className="px-3 py-1.5 rounded border">Edit</button>
                          <button onClick={()=>remove(r.id)} className="px-3 py-1.5 rounded border text-red-600">Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
