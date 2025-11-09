'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  listEmployees,
  type EmployeesResponse,
  listMenuItems,
  type MenuItemLite,
  createFieldDispatch,
  type CreateFieldDispatchInput,
} from '@/lib/api';

type FieldEmployee = EmployeesResponse['employees'][number];

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function FieldDispatchNewPage() {
  const router = useRouter();

  // form state
  const [date, setDate] = useState<string>(todayIsoDate());
  const [waiterId, setWaiterId] = useState<number | ''>('');
  const [itemId, setItemId] = useState<number | ''>('');
  const [qtyDispatched, setQtyDispatched] = useState<string>(''); // keep as string for input
  const [priceEach, setPriceEach] = useState<string>(''); // default from item.priceSell

  // data state
  const [employees, setEmployees] = useState<FieldEmployee[]>([]);
  const [items, setItems] = useState<MenuItemLite[]>([]);

  // ui state
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    id: number;
    waiterName?: string;
    itemName?: string;
    qty: number;
    price: number;
    date: string;
  } | null>(null);

  // local search (client-side) for items list
  const [itemSearch, setItemSearch] = useState('');

  // load employees (FIELD) and items on mount
  useEffect(() => {
    let mounted = true;

    async function loadEmployees() {
      try {
        setLoadingEmployees(true);
        const res = await listEmployees({ limit: 200 });
        if (!mounted) return;
        setEmployees(res.employees ?? []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load employees.');
      } finally {
        if (mounted) setLoadingEmployees(false);
      }
    }

    async function loadItems() {
      try {
        setLoadingItems(true);
        const res = await listMenuItems({ active: true, limit: 200 });
        if (!mounted) return;
        setItems(res);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load menu items.');
      } finally {
        if (mounted) setLoadingItems(false);
      }
    }

    loadEmployees();
    loadItems();
    return () => {
      mounted = false;
    };
  }, []);

  // when item changes, prefill priceEach
  useEffect(() => {
    if (!itemId) return;
    const found = items.find((i) => i.id === itemId);
    if (found) {
      setPriceEach(found.priceSell.toFixed(2));
    }
  }, [itemId, items]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.category ?? '').toLowerCase().includes(q)
    );
  }, [items, itemSearch]);

  function resetFormForNext() {
    setItemId('');
    setQtyDispatched('');
    // keep date & waiter the same for faster multiple entries
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // basic validations
    if (!waiterId || Number.isNaN(Number(waiterId))) {
      setError('Please select a field employee.');
      return;
    }
    if (!itemId || Number.isNaN(Number(itemId))) {
      setError('Please select a menu item.');
      return;
    }
    const qty = Number(qtyDispatched);
    if (Number.isNaN(qty) || qty <= 0) {
      setError('Quantity dispatched must be a number greater than 0.');
      return;
    }
    const price = Number(priceEach);
    if (Number.isNaN(price) || price < 0) {
      setError('Price each must be a number (0 or more).');
      return;
    }
    if (!date) {
      setError('Please select a date.');
      return;
    }

    try {
      setSubmitting(true);
      const payload: CreateFieldDispatchInput = {
        waiterId: Number(waiterId),
        itemId: Number(itemId),
        qtyDispatched: qty,
        priceEach: price,
        // send full ISO if you want exact time; backend accepts missing (uses now())
        date: new Date(date).toISOString(),
      };
      const created = await createFieldDispatch(payload);

      const wName = employees.find((w) => w.id === Number(waiterId))?.name;
      const iName = items.find((it) => it.id === Number(itemId))?.name;

      setSuccess({
        id: created.id,
        waiterName: wName,
        itemName: iName,
        qty,
        price,
        date,
      });

      // prepare for next input quickly
      resetFormForNext();
    } catch (e: any) {
      setError(e?.message || 'Failed to create dispatch.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">New Field Dispatch</h1>
        <p className="text-sm text-gray-500">
          Record what a field worker takes out in the morning. In the evening you’ll record returns and cash.
        </p>
      </div>

      {/* status */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <div className="font-medium">Dispatch created (ID: {success.id})</div>
          <div>
            {success.date} — {success.waiterName} → {success.itemName} &middot; Qty {success.qty} @ {success.price.toFixed(2)}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-md border px-3 py-1 text-sm"
              onClick={() => router.push(`/field-dispatch/${success.id}`)}
            >
              View dispatch
            </button>
            <button
              className="rounded-md border px-3 py-1 text-sm"
              onClick={() => setSuccess(null)}
            >
              Hide
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        {/* Date */}
        <div className="grid gap-1">
          <label className="text-sm font-medium">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            className="w-full rounded-md border px-3 py-2"
          />
        </div>

        {/* Waiter */}
        <div className="grid gap-1">
          <label className="text-sm font-medium">Field Employee</label>
          <div className="flex gap-2">
            <select
              value={waiterId}
              onChange={(e) => setWaiterId(Number(e.currentTarget.value))}
              className="w-full rounded-md border px-3 py-2"
              disabled={loadingEmployees}
            >
              <option value="">— select worker —</option>
              {employees.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.phone ? ` (${w.phone})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="whitespace-nowrap rounded-md border px-3 py-2 text-sm"
              onClick={async () => {
                setLoadingEmployees(true);
                try {
                  const res = await listEmployees({ limit: 200 });
                  setEmployees(res.employees ?? []);
                } catch (e: any) {
                  setError(e?.message || 'Failed to refresh employees.');
                } finally {
                  setLoadingEmployees(false);
                }
              }}
            >
              {loadingEmployees ? '…' : 'Refresh'}
            </button>
          </div>
          <p className="text-xs text-gray-500">Only FIELD employees are listed.</p>
        </div>

        {/* Item */}
        <div className="grid gap-1">
          <label className="text-sm font-medium">Item</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search item…"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.currentTarget.value)}
              className="w-1/2 rounded-md border px-3 py-2"
            />
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              onClick={async () => {
                setLoadingItems(true);
                try {
                  const res = await listMenuItems({ active: true, q: itemSearch || undefined, limit: 200 });
                  setItems(res);
                } catch (e: any) {
                  setError(e?.message || 'Failed to refresh items.');
                } finally {
                  setLoadingItems(false);
                }
              }}
            >
              {loadingItems ? '…' : 'Search/Refresh'}
            </button>
          </div>

          <select
            value={itemId}
            onChange={(e) => setItemId(Number(e.currentTarget.value))}
            className="mt-2 w-full rounded-md border px-3 py-2"
            disabled={loadingItems}
          >
            <option value="">— select item —</option>
            {filteredItems.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} {it.category ? `• ${it.category}` : ''} — default {it.priceSell.toFixed(2)} / {it.unit}
              </option>
            ))}
          </select>
        </div>

        {/* Qty + Price */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Quantity Dispatched</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={qtyDispatched}
              onChange={(e) => setQtyDispatched(e.currentTarget.value)}
              placeholder="e.g. 10"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm font-medium">Price Each (KES)</label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={priceEach}
              onChange={(e) => setPriceEach(e.currentTarget.value)}
              placeholder="auto from item, editable"
              className="w-full rounded-md border px-3 py-2"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-2 flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create Dispatch'}
          </button>
          <button
            type="button"
            className="rounded-lg border px-4 py-2"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setDate(todayIsoDate());
              setWaiterId('');
              setItemId('');
              setQtyDispatched('');
              setPriceEach('');
              setItemSearch('');
            }}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}
