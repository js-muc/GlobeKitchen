// ✅ DEDUCTIONS_AUDIT — apps/web/app/payroll/deductions/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  listSalaryDeductions,
  type SalaryDeductionListResponse,
  type SalaryDeduction,
} from "@/lib/api";
import { useEmployeesIndex } from "@/components/hooks/useEmployeesIndex";
import { useDebounce } from "@/components/hooks/useDebounce";
import Drawer from "@/components/ui/Drawer";
import SalaryDeductionForm from "@/app/payroll/SalaryDeductionForm";
import { Receipt, Search, Plus, AlertTriangle } from "lucide-react";

const REASONS = ["ADVANCE", "LOSS", "BREAKAGE", "OTHER"] as const;

function money(s: string | number) {
  const n = typeof s === "string" ? Number(s) : s;
  return Number.isFinite(n)
    ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : "—";
}

function renderMeta(v: unknown) {
  if (v == null) return "—";
  if (typeof v === "string") return v || "—";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Safely unwrap various possible list shapes from the API type */
function extractRows(resp?: SalaryDeductionListResponse): SalaryDeduction[] {
  if (!resp) return [];
  // common shapes: {data: [...]}, {items: [...]}, or an array
  const anyResp: any = resp as any;
  if (Array.isArray(anyResp)) return anyResp as SalaryDeduction[];
  if (Array.isArray(anyResp.data)) return anyResp.data as SalaryDeduction[];
  if (Array.isArray(anyResp.items)) return anyResp.items as SalaryDeduction[];
  return [];
}

export default function DeductionsPage() {
  /* ---------------- UI state ---------------- */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [employeeId, setEmployeeId] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [q, setQ] = useState("");

  const dq = useDebounce(q, 300);

  // Drawer
  const [open, setOpen] = useState(false);

  /* ---------------- Data ---------------- */
  // NOTE: listSalaryDeductions query type does NOT accept `limit`, so we only pass supported props.
  const qList = useQuery<SalaryDeductionListResponse>({
    queryKey: ["salary-deductions", { page, employeeId, q: dq, reason, dateFrom, dateTo }],
    queryFn: () => listSalaryDeductions({ page, employeeId }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  // id -> name labels
  const { map: nameMap } = useEmployeesIndex();

  /* ---------------- Derived ---------------- */
  // Server rows (unfiltered)
  const serverRows = extractRows(qList.data);

  // Client-side refine: reason, date range, keyword (note/meta/name)
  const filtered = useMemo(() => {
    const kw = dq.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;

    return serverRows.filter((d: SalaryDeduction) => {
      if (reason && d.reason !== reason) return false;
      if (from && new Date(d.date) < from) return false;
      if (to && new Date(d.date) > to) return false;

      if (!kw) return true;
      const hay = [
        nameMap.get(d.employeeId) ?? "",
        d.note ?? "",
        typeof d.meta === "string" ? d.meta : JSON.stringify(d.meta ?? ""),
        d.reason ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    });
  }, [serverRows, dq, reason, dateFrom, dateTo, nameMap]);

  // Client-side pagination (since API query type didn't accept `limit`)
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const rows = filtered.slice(start, start + limit);

  /* ---------------- Handlers ---------------- */
  const resetFilters = () => {
    setEmployeeId(undefined);
    setReason("");
    setDateFrom("");
    setDateTo("");
    setQ("");
    setPage(1);
  };

  /* ---------------- Render ---------------- */
  return (
    <DashboardShell>
      <div className="space-y-4">
        {/* Header & actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[color:var(--color-brand)]/10">
              <Receipt className="h-5 w-5 text-[color:var(--color-brand)]" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold leading-6">Salary Deductions</h1>
              <p className="text-sm text-gray-600">Audit advances & other deductions</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Add deduction
            </button>
          </div>
        </div>

        {/* Filters (responsive) */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {/* Keyword */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder="Search note, meta, employee…"
              className="w-full rounded-xl border pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]/50"
            />
          </div>

          {/* Employee */}
          <select
            value={employeeId ?? ""}
            onChange={(e) => {
              setPage(1);
              setEmployeeId(e.target.value ? Number(e.target.value) : undefined);
            }}
            className="rounded-xl border px-3 py-2"
          >
            <option value="">All employees</option>
            {Array.from(nameMap.entries()).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          {/* Reason */}
          <select
            value={reason}
            onChange={(e) => {
              setPage(1);
              setReason(e.target.value);
            }}
            className="rounded-xl border px-3 py-2"
          >
            <option value="">All reasons</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r[0] + r.slice(1).toLowerCase()}
              </option>
            ))}
          </select>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setPage(1);
                setDateFrom(e.target.value);
              }}
              className="rounded-xl border px-3 py-2"
              aria-label="From date"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setPage(1);
                setDateTo(e.target.value);
              }}
              className="rounded-xl border px-3 py-2"
              aria-label="To date"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={resetFilters}
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Reset filters
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Employee</th>
                <th className="px-3 py-2 text-left hidden md:table-cell">Reason</th>
                <th className="px-3 py-2 text-left hidden lg:table-cell">Note</th>
                <th className="px-3 py-2 text-left hidden lg:table-cell">Meta</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {qList.isLoading && (
                <tr className="border-t">
                  <td className="px-3 py-3 text-gray-500" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              )}

              {qList.isError && !qList.isLoading && (
                <tr className="border-t">
                  <td className="px-3 py-3" colSpan={6}>
                    <div className="flex items-center gap-2 text-rose-700">
                      <AlertTriangle className="h-5 w-5" />
                      <span>Could not load deductions.</span>
                    </div>
                  </td>
                </tr>
              )}

              {!qList.isLoading && !qList.isError && rows.length === 0 && (
                <tr className="border-t">
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={6}>
                    No deductions match your filters.
                  </td>
                </tr>
              )}

              {rows.map((d) => (
                <tr key={d.id} className="border-t hover:bg-gray-50/60">
                  <td className="px-3 py-2">{new Date(d.date).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{nameMap.get(d.employeeId) ?? `#${d.employeeId}`}</td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {d.reason[0] + d.reason.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">{d.note ?? "—"}</td>
                  <td className="px-3 py-2 hidden lg:table-cell">{renderMeta(d.meta)}</td>
                  <td className="px-3 py-2 text-right font-medium">{money(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination (client-side) */}
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
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}/page
                </option>
              ))}
            </select>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || qList.isFetching}
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || qList.isFetching}
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Drawer: quick-create deduction */}
      <Drawer open={open} onClose={() => setOpen(false)} title="Add salary deduction">
        <SalaryDeductionForm
          onSuccess={() => {
            setOpen(false);
            qList.refetch();
          }}
          onCancel={() => setOpen(false)}
        />
      </Drawer>
    </DashboardShell>
  );
}
