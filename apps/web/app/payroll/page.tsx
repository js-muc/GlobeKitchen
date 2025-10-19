// ✅ PAYROLL_INDEX — apps/web/app/payroll/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";

import {
  runPayroll,
  listPayroll,
  type PayrollRun,
  type PayrollListResponse,
} from "@/lib/api";

import {
  CalendarDays,
  Plus,
  AlertTriangle,
  Play,
  Eye,
  ExternalLink,
} from "lucide-react";
import Drawer from "@/components/ui/Drawer";
import SalaryDeductionForm from "./SalaryDeductionForm";
import PayrollRunDetails from "@/components/payroll/PayrollRunDetails";
import { useEmployeesIndex } from "@/components/hooks/useEmployeesIndex";
import { useRouter, useSearchParams } from "next/navigation";

function ymLabel(y: number, m: number) {
  // m is 1..12 on the server
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

export default function PayrollPage() {
  const router = useRouter();
  const search = useSearchParams();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const qPayroll = useQuery<PayrollListResponse>({
    queryKey: ["payroll", { page, limit }],
    queryFn: () => listPayroll({ page, limit }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const total = qPayroll.data?.meta.total ?? 0;
  const pages = qPayroll.data?.meta.pages ?? 1;
  const rows = qPayroll.data?.data ?? [];

  // Drawers
  const [openDed, setOpenDed] = useState(false);
  const [openRun, setOpenRun] = useState(false);
  const [runYear, setRunYear] = useState<number>(new Date().getFullYear());
  const [runMonth, setRunMonth] = useState<number>(new Date().getMonth() + 1);

  // Details drawer
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsYm, setDetailsYm] = useState<string | null>(null);

  // Warm employees index cache (names for details drawer)
  useEmployeesIndex();

  // Local error for the Run drawer (client/server)
  const [runFormError, setRunFormError] = useState<string | null>(null);

  // ----- URL <-> Drawer sync helpers -----
  const openDetails = (ym: string) => {
    setDetailsYm(ym);
    setDetailsOpen(true);
    // Deep link; no scroll jump and no full-page nav
    router.push(`/payroll?ym=${encodeURIComponent(ym)}`, { scroll: false });
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsYm(null);
    // Clear ym from URL
    router.push(`/payroll`, { scroll: false });
  };

  // Auto-open details if ?ym= exists (and keep it in sync)
  useEffect(() => {
    const ym = search.get("ym");
    if (!ym) {
      // If URL cleared, make sure drawer is closed
      if (detailsOpen) closeDetails();
      return;
    }
    // Avoid re-opening if same ym already displayed
    if (!detailsOpen || detailsYm !== ym) {
      setDetailsYm(ym);
      setDetailsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ✅ correctly declared (and typed) mutation — no nested declarations
  const mRun = useMutation<PayrollRun, Error, void>({
    mutationFn: () => runPayroll({ year: runYear, month: runMonth }),
    onSuccess: (run) => {
      setOpenRun(false);
      setRunFormError(null);
      qPayroll.refetch();

      // Auto-open details for the run that just completed + sync URL
      const ym = `${run.periodYear}-${run.periodMonth}`;
      openDetails(ym);
    },
    onError: (err) => {
      setRunFormError(err?.message || "Failed to run payroll");
    },
  });

  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* Header & Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[color:var(--color-brand)]/10">
              <CalendarDays className="h-5 w-5 text-[color:var(--color-brand)]" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold leading-6">Payroll</h1>
              <p className="text-sm text-gray-600">
                View runs, add deductions, and execute month-end.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => setOpenDed(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Add deduction
            </button>
            <button
              onClick={() => setOpenRun(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--color-brand)] px-3 py-2 text-white hover:brightness-110"
            >
              <Play className="h-4 w-4" />
              Run payroll
            </button>
          </div>
        </div>

        {/* Table (responsive scroll) */}
        <div className="overflow-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-left">Run at</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {qPayroll.isLoading && (
                <tr className="border-t">
                  <td className="px-3 py-3 text-gray-500" colSpan={4}>
                    Loading…
                  </td>
                </tr>
              )}

              {qPayroll.isError && !qPayroll.isLoading && (
                <tr className="border-t">
                  <td className="px-3 py-3" colSpan={4}>
                    <div className="flex items-center gap-2 text-rose-700">
                      <AlertTriangle className="h-5 w-5" />
                      <span>Could not load payroll runs.</span>
                    </div>
                  </td>
                </tr>
              )}

              {!qPayroll.isLoading && !qPayroll.isError && rows.length === 0 && (
                <tr className="border-t">
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={4}>
                    <div className="flex flex-col items-center gap-3">
                      <div>No payroll runs yet.</div>
                      <button
                        onClick={() => setOpenRun(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 hover:bg-gray-50"
                      >
                        <Play className="h-4 w-4" />
                        Run first payroll
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {rows.map((r) => {
                const ym = `${r.periodYear}-${r.periodMonth}`;
                return (
                  <tr key={ym} className="border-t hover:bg-gray-50/60">
                    <td className="px-3 py-2">{ymLabel(r.periodYear, r.periodMonth)}</td>
                    <td className="px-3 py-2">{new Date(r.runAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {/* Primary: inline view drawer (mobile-friendly) */}
                        <button
                          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 hover:bg-gray-50"
                          onClick={() => openDetails(ym)}
                          aria-label={`View details for ${ym}`}
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>

                        {/* Secondary: "Open" that deep-links (md+) */}
                        <button
                          className="hidden md:inline-flex items-center gap-1 rounded-lg border px-2 py-1 hover:bg-gray-50"
                          onClick={() => openDetails(ym)}
                          title="Open (deep link)"
                          aria-label={`Open full view for ${ym}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination (stacks on mobile) */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            Page {page} of {pages} • {total} total
          </p>
          <div className="flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => {
                setPage(1);
                setLimit(Number(e.target.value));
              }}
              className="rounded-xl border px-3 py-1.5"
              aria-label="Rows per page"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}/page
                </option>
              ))}
            </select>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || qPayroll.isFetching}
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || qPayroll.isFetching}
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Drawer: Add deduction */}
      <Drawer open={openDed} onClose={() => setOpenDed(false)} title="Add salary deduction">
        <SalaryDeductionForm
          onSuccess={() => {
            setOpenDed(false);
            // Potential toast here
          }}
          onCancel={() => setOpenDed(false)}
        />
      </Drawer>

      {/* Drawer: Run payroll */}
      <Drawer open={openRun} onClose={() => setOpenRun(false)} title="Run payroll">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Basic client-side validation to avoid obvious 400s
            if (!Number.isFinite(runYear) || runYear < 2000 || runYear > 9999) {
              setRunFormError("Enter a valid year (2000–9999).");
              return;
            }
            if (!Number.isFinite(runMonth) || runMonth < 1 || runMonth > 12) {
              setRunFormError("Month must be between 1 and 12.");
              return;
            }
            setRunFormError(null);
            mRun.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Year</span>
              <input
                type="number"
                inputMode="numeric"
                min={2000}
                max={9999}
                className="rounded-xl border px-3 py-2"
                value={runYear}
                onChange={(e) => setRunYear(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Month</span>
              <select
                className="rounded-xl border px-3 py-2"
                value={runMonth}
                onChange={(e) => setRunMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(0, i).toLocaleString(undefined, { month: "long" })}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Error message (server or client) */}
          {(runFormError || mRun.isError) && (
            <p className="text-sm text-rose-700">
              {runFormError || (mRun.error as any)?.message || "Failed to run payroll."}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border px-4 py-2 hover:bg-gray-50"
              onClick={() => setOpenRun(false)}
              disabled={mRun.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[color:var(--color-brand)] px-4 py-2 text-white hover:brightness-110 disabled:opacity-50"
              disabled={mRun.isPending}
            >
              {mRun.isPending ? "Running…" : "Run payroll"}
            </button>
          </div>
        </form>
      </Drawer>

      {/* Drawer: Payroll run details */}
      <PayrollRunDetails
        open={detailsOpen}
        ym={detailsYm}
        onClose={closeDetails}
      />
    </DashboardShell>
  );
}
