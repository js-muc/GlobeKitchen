'use client';

// apps/web/app/admin/employees/page.tsx
// Admin Employees CRUD (protected)
// - Reads/stores JWT from localStorage (key: adminJWT)
// - List employees (GET /api/employees)
// - Create (POST /api/employees)
// - Update inline (PUT /api/employees/:id)
// - Delete (DELETE /api/employees/:id)
// Enums follow backend: role: WAITER | CHEF | CASHIER | MANAGER | KITCHEN
//                        type: INSIDE | FIELD | KITCHEN
// Table codes allowed by API validators: A6 | A7 | A8 | A9 (nullable)
// Notes: salaryMonthly kept optional for legacy; commission is the primary pay.

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

const ROLES = ['WAITER','CHEF','CASHIER','MANAGER','KITCHEN'] as const;
const TYPES = ['INSIDE','FIELD','KITCHEN'] as const;
const TABLES = [null,'A6','A7','A8','A9'] as const; // null -> none

type Role = typeof ROLES[number];
type TypeT = typeof TYPES[number];

type EmployeeRow = {
  id: number; name: string; role: Role; type: TypeT; tableCode: string | null;
  phone: string | null; active: boolean; createdAt: string; salaryMonthly?: string | null;
};

function FormInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }
) {
  const { label, ...rest } = props;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-zinc-500">{label}</span>
      <input {...rest} className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black/20" />
    </label>
  );
}

function Select<T extends string | null>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: readonly T[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-zinc-500">{label}</span>
      <select
        value={(value ?? '') as string}
        onChange={(e) => onChange((e.target.value === '' ? null : e.target.value) as T)}
        className="border rounded-lg px-3 py-2"
      >
        {options.map((opt, i) => (
          <option key={i} value={(opt ?? '') as string}>{opt ?? '— none —'}</option>
        ))}
      </select>
    </label>
  );
}

export default function EmployeesAdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const api = useMemo(() => makeApi(token || undefined), [token]);

  useEffect(() => { const t = localStorage.getItem('adminJWT'); if (t) setToken(t); }, []);

  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true); setErr(null);
    try {
      const list = await api.get<EmployeeRow[]>('/employees');
      setRows(list);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [token]);

  // create form state
  const [cName, setCName] = useState('');
  const [cRole, setCRole] = useState<Role>('WAITER');
  const [cType, setCType] = useState<TypeT>('INSIDE');
  const [cTable, setCTable] = useState<string | null>(null);
  const [cPhone, setCPhone] = useState('');
  const [cActive, setCActive] = useState(true);
  const [busyCreate, setBusyCreate] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  async function createEmployee() {
    if (!token) return;
    setBusyCreate(true); setCreateMsg(null);
    try {
      const body: any = {
        name: cName.trim(), role: cRole, type: cType,
        tableCode: cTable, phone: cPhone.trim() || null, active: cActive,
      };
      if (!body.name) throw new Error('Name is required');
      const created = await api.post<EmployeeRow>('/employees', body);
      setRows((r) => [...r, created]);
      setCreateMsg('Employee created');
      setCName(''); setCRole('WAITER'); setCType('INSIDE'); setCTable(null); setCPhone(''); setCActive(true);
    } catch (e: any) {
      setCreateMsg(e?.message || 'Create failed');
    } finally { setBusyCreate(false); }
  }

  // edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Partial<EmployeeRow>>({});
  function startEdit(row: EmployeeRow) {
    setEditingId(row.id);
    setEdit({ ...row });
  }
  function cancelEdit() { setEditingId(null); setEdit({}); }

  async function saveEdit() {
    if (!token || editingId == null) return;
    try {
      const payload: any = {
        name: edit.name, role: edit.role, type: edit.type,
        tableCode: (edit.tableCode === '' ? null : edit.tableCode) as string | null,
        phone: (edit.phone ?? null), active: edit.active,
      };
      const updated = await api.put<EmployeeRow>(`/employees/${editingId}`, payload);
      setRows((r) => r.map((x) => (x.id === editingId ? updated : x)));
      cancelEdit();
    } catch (e: any) {
      alert(e?.message || 'Update failed');
    }
  }

  async function remove(id: number) {
    if (!token) return;
    if (!confirm('Delete this employee? This action cannot be undone.')) return;
    try {
      await api.del(`/employees/${id}`);
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
        <h1 className="text-2xl font-bold">Employees</h1>
        <div className="text-xs text-zinc-500">Server: {API_BASE}</div>
      </div>

      {/* Create */}
      <div className="rounded-2xl border p-4 space-y-3 bg-white/50 dark:bg-zinc-900">
        <div className="font-medium">Add Employee</div>
        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
          <FormInput label="Name" value={cName} onChange={(e)=>setCName(e.target.value)} />
          <Select label="Role" value={cRole} onChange={v=>setCRole(v as Role)} options={ROLES} />
          <Select label="Type" value={cType} onChange={v=>setCType(v as TypeT)} options={TYPES} />
          <Select label="Table Code" value={cTable} onChange={v=>setCTable(v)} options={TABLES} />
          <FormInput label="Phone" value={cPhone} onChange={(e)=>setCPhone(e.target.value)} />
          <label className="flex items-center gap-2 text-sm mt-6 md:mt-0">
            <input type="checkbox" checked={cActive} onChange={(e)=>setCActive(e.target.checked)} /> Active
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={createEmployee} disabled={busyCreate} className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-50">{busyCreate? 'Saving…':'Create'}</button>
          {createMsg && <div className="text-sm text-zinc-600">{createMsg}</div>}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden">
        <div className="p-4 border-b bg-white/60 dark:bg-zinc-900 flex items-center justify-between">
          <div className="font-medium">All Employees</div>
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
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Table</th>
                  <th className="text-left p-3">Phone</th>
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
                        <select className="border rounded px-2 py-1" value={String(edit.role)} onChange={(e)=>setEdit((s)=>({ ...s, role: e.target.value as Role }))}>
                          {ROLES.map((x)=> <option key={x} value={x}>{x}</option>)}
                        </select>
                      ) : r.role}
                    </td>
                    <td className="p-3">
                      {editingId === r.id ? (
                        <select className="border rounded px-2 py-1" value={String(edit.type)} onChange={(e)=>setEdit((s)=>({ ...s, type: e.target.value as TypeT }))}>
                          {TYPES.map((x)=> <option key={x} value={x}>{x}</option>)}
                        </select>
                      ) : r.type}
                    </td>
                    <td className="p-3">
                      {editingId === r.id ? (
                        <select className="border rounded px-2 py-1" value={String(edit.tableCode ?? '')} onChange={(e)=>setEdit((s)=>({ ...s, tableCode: e.target.value === '' ? null : e.target.value }))}>
                          {TABLES.map((t,i)=> <option key={i} value={t ?? ''}>{t ?? '—'}</option>)}
                        </select>
                      ) : (r.tableCode ?? '—')}
                    </td>
                    <td className="p-3">
                      {editingId === r.id ? (
                        <input className="border rounded px-2 py-1 w-full" value={String(edit.phone ?? '')} onChange={(e)=>setEdit((s)=>({ ...s, phone: e.target.value }))} />
                      ) : (r.phone ?? '—')}
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
