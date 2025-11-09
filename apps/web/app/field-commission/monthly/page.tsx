'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api, listEmployees, type EmployeesResponse } from '@/lib/api';

type MonthlyCommissionRow = {
  waiterId: number;
  waiterName: number | string;
  soldAmount: number;
  commission: number;
  cashRemit: number;
  grossSales?: number;
  activeDays: number;
};

type MonthlyCommissionResponse = {
  ok: boolean;
  year: number;
  month: number; // 1..12
  range: { from: string; to: string }; // YYYY-MM-DD
  totals: {
    soldAmount: number;
    commission: number;
    cashRemit: number;
  };
  results: MonthlyCommissionRow[];
};

function nowYm() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

export default function FieldCommissionMonthlyPage() {
  const { y, m } = nowYm();

  // filters
  const [year, setYear] = useState<number>(y);
  const [month, setMonth] = useState<number>(m);
  const [waiterId, setWaiterId] = useState<number | ''>('');

  // data
  const [employees, setEmployees] = useState<EmployeesResponse['employees']>([]);
  const [data, setData] = useState<MonthlyCommissionResponse | null>(null);

  // ui state
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // load field employees for filter
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingEmployees(true);
        const res = await listEmployees({ limit: 200 });
        if (mounted) setEmployees(res.employees ?? []);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load employees');
      } finally {
        if (mounted) setLoadingEmployees(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function fetchMonthly() {
    setError(null);
    setLoading(true);
    try {
      const params: any = { year, month };
      if (waiterId) params.waiterId = Number(waiterId);

      // There is no canonical aggregated monthly endpoint (per-employee preview exists).
      // For monthly list we keep using the legacy aggregated endpoint which has been
      // updated on the server to use canonical bracket logic.
      const { data } = await api.get<MonthlyCommissionResponse>('/api/field-commission/monthly', { params });
      setData(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load monthly commission');
    } finally {
      setLoading(false);
    }
  }

  // load when filters change
  useEffect(() => {
    if (!year || !month) return;
    fetchMonthly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, waiterId]);

  const grand = useMemo(() => {
    if (!data?.totals) return { soldAmount: 0, commission: 0, cashRemit: 0 };
    return data.totals;
  }, [data]);

  // helpers for selects
  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => cur - i); // current year back 5 years
  }, []);
  const months = [
    { v: 1, n: 'Jan' }, { v: 2, n: 'Feb' }, { v: 3, n: 'Mar' }, { v: 4, n: 'Apr' },
    { v: 5, n: 'May' }, { v: 6, n: 'Jun' }, { v: 7, n: 'Jul' }, { v: 8, n: 'Aug' },
    { v: 9, n: 'Sep' }, { v: 10, n: 'Oct' }, { v: 11, n: 'Nov' }, { v: 12, n: 'Dec' },
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Monthly Field Commission</h1>
        <p className="text-sm text-gray-500">
          Per field worker: sold totals, commission (per-dispatch brackets), cash remitted — for the selected month.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className="text-sm font-medium">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.currentTarget.value))}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {years.map((yy) => (
              <option key={yy} value={yy}>{yy}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.currentTarget.value))}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {months.map((m) => (
              <option key={m.v} value={m.v}>{m.n}</option>
            ))}
          </select>
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
            onClick={fetchMonthly}
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
              <th className="px-3 py-2 text-right font-medium">Active Days</th>
            </tr>
          </thead>
          <tbody>
            {(data?.results ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  {loading ? 'Loading…' : 'No data for this month.'}
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
                <td className="px-3 py-2 text-right">{r.activeDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Range note */}
      {data?.range && (
        <p className="mt-3 text-xs text-gray-500">
          Range: {data.range.from} → {data.range.to}
        </p>
      )}
    </div>
  );
}
