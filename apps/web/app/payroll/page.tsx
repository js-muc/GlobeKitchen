'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  listPayroll,
  runPayroll,          // kept for parity, but not used here (viewer)
  getPayrollByYm,
  type PayrollRun,
} from '@/lib/api';

function nowYm() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

export default function PayrollPage() {
  // filters for list
  const { y, m } = nowYm();
  const [year, setYear] = useState<number>(y);
  const [month, setMonth] = useState<number>(m);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // run payroll form (viewer page won’t call runPayroll; retained UI for consistency if needed)
  const [runYear, setRunYear] = useState<number>(y);
  const [runMonth, setRunMonth] = useState<number>(m);
  const [overwrite, setOverwrite] = useState<boolean>(false);

  // data state
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [total, setTotal] = useState<number>(0);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [justRan, setJustRan] = useState<PayrollRun | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null); // "YYYY-MM"

  // load list
  async function loadList() {
    setError(null);
    setLoading(true);
    try {
      const res = await listPayroll({
        year,
        month,
        page,
        pageSize,
        includeLines: false,
      });
      setRuns(res.runs ?? []);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      setError(e?.message || 'Failed to load payroll runs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, page, pageSize]);

  // helpers
  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => cur - i); // current year back 5
  }, []);
  const months = [
    { v: 1, n: 'Jan' }, { v: 2, n: 'Feb' }, { v: 3, n: 'Mar' }, { v: 4, n: 'Apr' },
    { v: 5, n: 'May' }, { v: 6, n: 'Jun' }, { v: 7, n: 'Jul' }, { v: 8, n: 'Aug' },
    { v: 9, n: 'Sep' }, { v: 10, n: 'Oct' }, { v: 11, n: 'Nov' }, { v: 12, n: 'Dec' },
  ];

  async function handleRunPayroll(e: React.FormEvent) {
    e.preventDefault();
    // This viewer page normally wouldn’t run payroll; keeping it functional if you want it:
    setError(null);
    setLoading(true);
    setJustRan(null);
    try {
      const created = await runPayroll({ year: runYear, month: runMonth, overwrite });
      setJustRan(created);
      await loadList();
    } catch (e: any) {
      setError(e?.message || 'Failed to run payroll');
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(yy: number, mm: number) {
    const key = `${yy}-${String(mm).padStart(2, '0')}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      setRuns((prev) =>
        prev.map((r) => (r.periodYear === yy && r.periodMonth === mm ? { ...r, lines: undefined } : r))
      );
      return;
    }
    try {
      setExpandedKey(key);
      const full = await getPayrollByYm({ year: yy, month: mm });
      setRuns((prev) =>
        prev.map((r) =>
          r.periodYear === yy && r.periodMonth === mm
            ? { ...r, lines: full.lines ?? [], totals: full.totals, lineCount: full.lines?.length ?? r.lineCount }
            : r
        )
      );
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch payroll details');
      setExpandedKey(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Payroll</h1>
        <p className="text-sm text-gray-500">
          Generate monthly payroll from field commissions and salary deductions, and review past runs.
        </p>
      </div>

      {/* Status banners */}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {justRan && (
        <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Payroll generated: <strong>{justRan.periodYear}-{String(justRan.periodMonth).padStart(2, '0')}</strong> •{' '}
          {justRan.lines ? `${justRan.lines.length} lines` : (justRan.lineCount ?? 0) + ' lines'}
        </div>
      )}

      {/* Run payroll form (optional here) */}
      <form onSubmit={handleRunPayroll} className="mb-6 grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-5">
        <div>
          <label className="text-sm font-medium">Year</label>
          <select
            value={runYear}
            onChange={(e) => setRunYear(Number(e.currentTarget.value))}
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
            value={runMonth}
            onChange={(e) => setRunMonth(Number(e.currentTarget.value))}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {months.map((mm) => (
              <option key={mm.v} value={mm.v}>{mm.n}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.currentTarget.checked)}
            />
            Overwrite if exists
          </label>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button
            type="submit"
            className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Running…' : 'Run Payroll'}
          </button>
        </div>
      </form>

      {/* List filters */}
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className="text-sm font-medium">Filter: Year</label>
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.currentTarget.value)); setPage(1); }}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            <option value="">All</option>
            {years.map((yy) => (
              <option key={yy} value={yy}>{yy}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Filter: Month</label>
          <select
            value={month}
            onChange={(e) => { setMonth(Number(e.currentTarget.value)); setPage(1); }}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            <option value="">All</option>
            {months.map((mm) => (
              <option key={mm.v} value={mm.v}>{mm.n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Page size</label>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.currentTarget.value)); setPage(1); }}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {[10, 20, 50, 100].map((ps) => (
              <option key={ps} value={ps}>{ps}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <div className="flex w-full items-center justify-between gap-2">
            <button
              type="button"
              onClick={loadList}
              className="w-full rounded-md border px-4 py-2 text-sm"
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Runs table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-right font-medium">Lines</th>
              <th className="px-3 py-2 text-right font-medium">Gross</th>
              <th className="px-3 py-2 text-right font-medium">Deductions</th>
              <th className="px-3 py-2 text-right font-medium">Carry Fwd</th>
              <th className="px-3 py-2 text-right font-medium">Net Pay</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  {loading ? 'Loading…' : 'No runs yet.'}
                </td>
              </tr>
            )}
            {runs.map((r) => {
              const period = `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}`;
              const t = r.totals ?? { gross: 0, deductionsApplied: 0, carryForward: 0, netPay: 0 };
              const isExpanded = expandedKey === period && (r.lines?.length ?? 0) > 0;
              return (
                <React.Fragment key={period}>
                  <tr className="border-t">
                    <td className="px-3 py-2">{period}</td>
                    <td className="px-3 py-2 text-right">{r.lineCount ?? r.lines?.length ?? 0}</td>
                    <td className="px-3 py-2 text-right">
                      {t.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.deductionsApplied.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.carryForward.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="rounded border px-3 py-1 text-xs"
                        onClick={() => toggleExpand(r.periodYear, r.periodMonth)}
                      >
                        {isExpanded ? 'Hide lines' : 'View lines'}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded lines */}
                  {isExpanded && (
                    <tr className="bg-gray-50">
                      <td colSpan={7} className="px-3 py-3">
                        <div className="overflow-x-auto rounded border">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="bg-white">
                                <th className="px-2 py-2 text-left font-medium">Employee</th>
                                <th className="px-2 py-2 text-right font-medium">Gross</th>
                                <th className="px-2 py-2 text-right font-medium">Deductions</th>
                                <th className="px-2 py-2 text-right font-medium">Carry Fwd</th>
                                <th className="px-2 py-2 text-right font-medium">Net Pay</th>
                                <th className="px-2 py-2 text-left font-medium">Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(r.lines ?? []).map((L) => (
                                <tr key={L.id} className="border-t">
                                  <td className="px-2 py-2">#{L.employeeId}</td>
                                  <td className="px-2 py-2 text-right">
                                    {L.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    {L.deductionsApplied.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    {L.carryForward.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    {L.netPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-2">{L.note ?? '—'}</td>
                                </tr>
                              ))}
                              {(r.lines ?? []).length === 0 && (
                                <tr>
                                  <td colSpan={6} className="px-2 py-4 text-center text-gray-500">
                                    No lines found.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-sm">
        <div>
          Page {page} of {totalPages} ({total} total)
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            className="rounded border px-3 py-1 disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
