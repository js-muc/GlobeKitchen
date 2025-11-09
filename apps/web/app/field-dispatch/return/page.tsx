'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  listEmployees,
  listFieldDispatches,
  returnFieldDispatch,
  type EmployeesResponse,
  type FieldDispatchListItem,
} from '@/lib/api';

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default function FieldDispatchReturnPage() {
  const router = useRouter();

  // form state
  const [date, setDate] = useState(todayIso());
  const [waiterId, setWaiterId] = useState<number | ''>('');
  const [dispatchId, setDispatchId] = useState<number | ''>('');
  const [qtyReturned, setQtyReturned] = useState('');
  const [lossQty, setLossQty] = useState('');
  const [cashCollected, setCashCollected] = useState('');

  // data state
  const [employees, setEmployees] = useState<EmployeesResponse['employees']>([]);
  const [dispatches, setDispatches] = useState<FieldDispatchListItem[]>([]);

  // ui state
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingDispatches, setLoadingDispatches] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any>(null);

  // load field employees on mount
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoadingEmployees(true);
        const res = await listEmployees({ limit: 200 });
        if (mounted) setEmployees(res.employees ?? []);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load employees');
      } finally {
        if (mounted) setLoadingEmployees(false);
      }
    }
    load();
    return () => { mounted = false };
  }, []);

  // load dispatches when date & employee picked
  useEffect(() => {
    if (!date || !waiterId) return;
    async function load() {
      try {
        setLoadingDispatches(true);
        const rows = await listFieldDispatches({ date, waiterId: Number(waiterId) });
        setDispatches(rows);
      } catch (e: any) {
        setError(e?.message || 'Failed to load dispatch records');
      } finally {
        setLoadingDispatches(false);
      }
    }
    load();
  }, [date, waiterId]);

  const selectedDispatch = useMemo(() => {
    return dispatches.find((d) => d.id === dispatchId);
  }, [dispatchId, dispatches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!dispatchId) return setError("Select dispatch");
    const qr = Number(qtyReturned);
    const lq = Number(lossQty || 0);
    const cash = Number(cashCollected);

    if (isNaN(qr) || qr < 0) return setError("Invalid qty returned");
    if (isNaN(lq) || lq < 0) return setError("Invalid loss qty");
    if (isNaN(cash) || cash < 0) return setError("Invalid cash collected");

    try {
      setSubmitting(true);
      const result = await returnFieldDispatch(Number(dispatchId), {
        qtyReturned: qr,
        lossQty: lq,
        cashCollected: cash,
        note: '',
      });
      setSuccess(result);
      // reset fields (keep employee + date)
      setDispatchId('');
      setQtyReturned('');
      setLossQty('');
      setCashCollected('');
    } catch (e: any) {
      setError(e?.message || 'Failed to record return');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-semibold">Field Return</h1>
      <p className="mb-6 text-sm text-gray-500">
        In the evening, record returned items & cash collected from field staff.
      </p>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <div className="font-medium">Return recorded ✔</div>
          <div className="mt-1 text-xs">
            Sold Qty: {success.computed.soldQty} |
            Sold Amount: {success.computed.soldAmount} |
            Commission: {success.computed.commission}
          </div>
          <button
            className="mt-2 rounded border px-3 py-1 text-xs"
            onClick={() => router.push(`/field-dispatch/${success.fieldReturn.dispatchId}`)}
          >
            View dispatch
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        {/* date */}
        <div>
          <label className="text-sm font-medium">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>

        {/* employee */}
        <div>
          <label className="text-sm font-medium">Field Employee</label>
          <select
            value={waiterId}
            onChange={(e) => setWaiterId(Number(e.target.value))}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            <option value="">— select —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{e.phone ? ` (${e.phone})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* dispatch record */}
        {waiterId && (
          <div>
            <label className="text-sm font-medium">Dispatch</label>
            <select
              value={dispatchId}
              onChange={(e) => setDispatchId(Number(e.target.value))}
              className="mt-1 w-full rounded border px-3 py-2"
              disabled={loadingDispatches}
            >
              <option value="">— select —</option>
              {dispatches.map((d) => (
                <option key={d.id} value={d.id}>
                  #{d.id} {d.item?.name} — {d.qtyDispatched} units @ {d.priceEach}
                </option>
              ))}
            </select>
            {selectedDispatch && (
              <p className="mt-1 text-xs text-gray-500">
                Dispatched: {selectedDispatch.qtyDispatched} × {selectedDispatch.priceEach}
              </p>
            )}
          </div>
        )}

        {/* return inputs */}
        {dispatchId && (
          <>
            <div>
              <label className="text-sm font-medium">Quantity Returned</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={qtyReturned}
                onChange={(e) => setQtyReturned(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Loss Qty (if any)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={lossQty}
                onChange={(e) => setLossQty(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Cash Collected (KES)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cashCollected}
                onChange={(e) => setCashCollected(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Record Return'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
