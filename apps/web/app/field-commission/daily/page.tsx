'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api, listEmployees, type EmployeesResponse } from '@/lib/api';

type DailyCommissionRow = {
  waiterId: number;
  waiterName: string;
  soldAmount: number;
  commission: number;
  cashRemit: number;
  grossSales?: number;
};

type DailyCommissionResponse = {
  ok: boolean;
  date: string; // YYYY-MM-DD
  waiterId?: number;
  totals: {
    soldAmount: number;
    commission: number;
    cashRemit: number;
  };
  results: DailyCommissionRow[];
};

function todayIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function FieldCommissionDailyPage() {
  const [date, setDate] = useState<string>(todayIso());
  const [waiterId, setWaiterId] = useState<number | ''>('');
  const [employees, setEmployees] = useState<EmployeesResponse['employees']>([]);

  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DailyCommissionResponse | null>(null);

  // Load employees
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingEmployees(true);
        const res = await listEmployees({ limit: 200 });
        if (!mounted) return;
        setEmployees(res.employees ?? []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load employees');
      } finally {
        if (mounted) setLoadingEmployees(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Hybrid fetch: when a specific waiter is selected call canonical preview
  // (/commission/field/today/:id?dateISO=...), otherwise call aggregated legacy endpoint
  async function fetchDaily() {
    setError(null);
    setLoading(true);
    try {
      if (waiterId) {
        // Use canonical per-employee preview
        const resp = await api.get<{ dateISO: string; waiterId: number; cashCollected: number; commission: number; nextTarget?: any }>(`/commission/field/today/${waiterId}`, {
          params: { dateISO: date },
        });

        const waiter = employees.find((e) => e.id === Number(waiterId));
        const waiterName = waiter ? waiter.name + (waiter.phone ? ` (${waiter.phone})` : '') : `#${waiterId}`;

        const single: DailyCommissionResponse = {
          ok: true,
          date,
          waiterId: Number(waiterId),
          totals: {
            soldAmount: Number((resp.data.cashCollected ?? 0).toFixed(2)),
            commission: Number((resp.data.commission ?? 0).toFixed(2)),
            cashRemit: Number((resp.data.cashCollected ?? 0).toFixed(2)),
          },
          results: [
            {
              waiterId: Number(waiterId),
              waiterName,
              // For the canonical single-preview we only have cashCollected (cash) — show that as soldAmount for consistency
              soldAmount: Number((resp.data.cashCollected ?? 0).toFixed(2)),
              commission: Number((resp.data.commission ?? 0).toFixed(2)),
              cashRemit: Number((resp.data.cashCollected ?? 0).toFixed(2)),
              grossSales: undefined,
            },
          ],
        };

        setData(single);
      } else {
        // Legacy aggregated endpoint (keeps original aggregation behavior)
        const params: any = { date };
        const res = await api.get<DailyCommissionResponse>('/api/field-commission/daily', { params });
        setData(res.data);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load daily commission');
    } finally {
      setLoading(false);
    }
  }

  // Auto-load on mount and whenever date/worker changes
  useEffect(() => {
    if (!date) return;
    fetchDaily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, waiterId]);

  const grand = useMemo(() => {
    if (!data?.totals) return { soldAmount: 0, commission: 0, cashRemit: 0 };
    return data.totals;
  }, [data]);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Daily Field Commission</h1>
        <p className="text-sm text-gray-500">
          Summarized per field worker: sold amount, commission (per-dispatch brackets), and cash remitted.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="text-sm font-medium">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Field Employee (optional)</label>
          <select
            value={waiterId}
            onChange={(e) => setWaiterId(e.currentTarget.value ? Number(e.currentTarget.value) : '')}
            className="mt-1 w-full rounded border px-3 py-2"
            disabled={loadingEmployees}
          >
            <option value="">All field employees</option>
            {employees.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}{w.phone ? ` (${w.phone})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={fetchDaily}
            className="w-full rounded-md border px-4 py-2 text-sm"
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Totals */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">Total Sold (KES)</div>
          <div className="text-xl font-semibold">
            {grand.soldAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">Total Commission (KES)</div>
          <div className="text-xl font-semibold">
            {grand.commission?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-gray-500">Total Cash Remitted (KES)</div>
          <div className="text-xl font-semibold">
            {grand.cashRemit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left font-medium">Field Employee</th>
              <th className="px-3 py-2 text-right font-medium">Sold Amount (KES)</th>
              <th className="px-3 py-2 text-right font-medium">Commission (KES)</th>
              <th className="px-3 py-2 text-right font-medium">Cash Remitted (KES)</th>
              <th className="px-3 py-2 text-right font-medium">Gross (optional)</th>
            </tr>
          </thead>
          <tbody>
            {(data?.results ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  {loading ? 'Loading…' : 'No data for this day.'}
                </td>
              </tr>
            )}
            {(data?.results ?? []).map((r) => (
              <tr key={r.waiterId} className="border-t">
                <td className="px-3 py-2">{r.waiterName}</td>
                <td className="px-3 py-2 text-right">
                  {r.soldAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.cashRemit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-right text-gray-500">
                  {typeof r.grossSales === 'number'
                    ? r.grossSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="mt-3 text-xs text-gray-500">
        Commission is calculated per dispatch using your brackets, then summed per worker for the day.
      </p>
    </div>
  );
}
