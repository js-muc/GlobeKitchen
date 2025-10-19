// ✅ EMPLOYEES_PAGE (RESPONSIVE + CREATE/EDIT + HARD DELETE + UI TWEAK) — apps/web/app/employees/page.tsx
"use client";

/* ============================
   ✅ IMPORTS
============================ */
import React, { useMemo, useState } from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import { useQuery, keepPreviousData, useMutation } from "@tanstack/react-query";
import {
  listEmployees,
  type EmployeesQuery,
  type EmployeesResponse,
  // deleteEmployee,   // not used: we need to force hard delete via query (?force=true)
  api,                 // use axios instance directly to send force=true
} from "@/lib/api";
import { useDebounce } from "@/components/hooks/useDebounce";
import { TableWrap, Th, Td, SkeletonRow } from "@/components/ui/Table";
import { Users2, Search, AlertTriangle, Plus, Pencil, Trash2, Info } from "lucide-react";

// ➕ Drawer + Form for creating/editing employee
import Drawer from "@/components/ui/Drawer";
import EmployeeForm from "./EmployeeForm";

/* ============================
   ✅ CONSTANTS
============================ */
const ROLES = ["WAITER", "CHEF", "CASHIER", "MANAGER", "KITCHEN"];

/* ============================
   ✅ HELPERS
============================ */
// Accept string | number for salary (API may return "30000.00")
const money = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n as number) ? (n as number).toLocaleString() : "—";
};

/* ============================
   ✅ PAGE
============================ */
export default function EmployeesPage() {
  /* ---------- UI State ---------- */
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string | undefined>(undefined);

  // ➕ Drawers
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);

  // Inline banner after actions
  const [banner, setBanner] = useState<null | { tone: "info" | "success" | "warning" | "error"; text: string }>(null);

  /* ---------- Debounced search ---------- */
  const dq = useDebounce(q, 350);

  /* ---------- Query key ---------- */
  const queryKey = useMemo(
    () => ["employees", { page, limit, q: dq, role }],
    [page, limit, dq, role]
  );

  /* ---------- Server data (typed) ---------- */
  const qEmployees = useQuery<EmployeesResponse>({
    queryKey,
    queryFn: () => listEmployees({ page, limit, q: dq, role } as EmployeesQuery),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  const total = qEmployees.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const rows = qEmployees.data?.employees ?? [];

  /* ---------- Mutations ---------- */
  // Hard delete (permanent) — add ?force=true and normalize 204 empty responses
  const mDelete = useMutation<
    { ok: true; mode?: "hard" | "soft" }, // normalized success payload
    any,
    number | string
  >({
    mutationFn: async (id) => {
      const resp = await api.delete(`/employees/${String(id)}`, { params: { force: true } });
      // Some servers return 204 No Content — normalize that to { ok: true, mode: "hard" }
      if (resp.status === 204 || resp.data == null) {
        return { ok: true, mode: "hard" as const };
      }
      // If server returns a structured body, prefer it, but coerce ok:true
      const data = resp.data as any;
      return {
        ok: true,
        mode: (data?.mode as "hard" | "soft" | undefined) ?? "hard",
      };
    },
    onSuccess: (res) => {
      qEmployees.refetch();
      setBanner({
        tone: "success",
        text: res?.mode === "soft"
          ? "Employee removed (soft)."
          : "Employee permanently deleted.",
      });
    },
    onError: (err: any) => {
      const msg =
        err?.message === "unauthorized"
          ? "You are not signed in. Please log in and try again."
          : err?.response?.data?.error ||
            err?.response?.data?.message ||
            (typeof err?.response?.data?.detail === "string" ? err.response.data.detail : "") ||
            err?.message ||
            "Failed to delete employee.";
      setBanner({ tone: "error", text: msg });
    },
  });

  /* ---------- Handlers ---------- */
  const onPrev = () => setPage((p) => Math.max(1, p - 1));
  const onNext = () => setPage((p) => Math.min(pages, p + 1));
  const onLimit = (val: number) => {
    setPage(1);
    setLimit(val);
  };
  const onSearch = (val: string) => {
    setPage(1);
    setQ(val);
  };
  const onRole = (val: string) => {
    setPage(1);
    setRole(val || undefined);
  };

  const onEdit = (row: any) => {
    setEditRow(row);
    setEditOpen(true);
  };

  const onDelete = (row: any) => {
    const ok = window.confirm(
      `PERMANENT delete “${row.name}” (ID ${row.id})?\nThis will remove the employee record.\n\nTip: Hold Shift and click OK to skip this dialog next time.`
    );
    if (!ok) return;
    mDelete.mutate(row.id);
  };

  /* ---------- Banner component ---------- */
  const Banner = banner ? (
    <div
      role="status"
      className={
        "rounded-xl border px-3 py-2 text-sm " +
        (banner.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : banner.tone === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : banner.tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-sky-200 bg-sky-50 text-sky-800")
      }
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">{banner.text}</div>
        <button
          onClick={() => setBanner(null)}
          className="rounded-md px-2 py-0.5 text-xs hover:bg-white/60"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  ) : null;

  /* ============================
     ✅ RENDER
  ============================ */
  return (
    <DashboardShell>
      {/* ✅ PAGE_CONTAINER */}
      <div className="space-y-4">
        {/* Inline banner (stack-safe) */}
        {Banner}

        {/* ✅ HEADER + CONTROLS (stack on mobile) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[color:var(--color-brand)]/10">
              <Users2 className="h-5 w-5 text-[color:var(--color-brand)]" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold leading-6">Employees</h1>
              <p className="text-sm text-gray-600">Search, filter, paginate, edit & delete</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={q}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search name, email, phone…"
                className="w-full rounded-xl border pl-9 pr-3 py-2 outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]/50"
                aria-label="Search employees"
              />
            </div>

            {/* Role filter */}
            <select
              value={role ?? ""}
              onChange={(e) => onRole(e.target.value)}
              className="w-full sm:w-44 rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]/50"
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r[0] + r.slice(1).toLowerCase()}
                </option>
              ))}
            </select>

            {/* Page size */}
            <select
              value={limit}
              onChange={(e) => onLimit(Number(e.target.value))}
              className="w-full sm:w-28 rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]/50"
              aria-label="Rows per page"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}/page
                </option>
              ))}
            </select>

            {/* ➕ New employee (opens drawer) */}
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              New employee
            </button>
          </div>
        </div>

        {/* ✅ TABLE (horizontal scroll on small screens) */}
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>ID</Th>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Role</Th>
                {/* New columns (responsive visibility) */}
                <Th className="hidden lg:table-cell">Type</Th>
                <Th className="hidden md:table-cell">Table</Th>
                <Th className="hidden md:table-cell">Active</Th>
                <Th>Base Salary</Th>
                <Th>Created</Th>
                <Th className="w-[112px] text-right">Actions</Th>
              </tr>
            </thead>

            <tbody>
              {/* Loading state (skeleton rows) */}
              {qEmployees.isLoading &&
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={11} />)}

              {/* Error state */}
              {qEmployees.isError && !qEmployees.isLoading && (
                <tr className="border-t">
                  <Td colSpan={11}>
                    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-rose-700">
                        <AlertTriangle className="h-5 w-5" />
                        <span>
                          {(qEmployees.error as any)?.message === "unauthorized"
                            ? "You are not signed in. Please log in again."
                            : "Could not load employees."}
                        </span>
                      </div>
                      <button
                        onClick={() => qEmployees.refetch()}
                        className="self-start rounded-xl border px-3 py-1.5 hover:bg-gray-50 sm:self-auto"
                      >
                        Retry
                      </button>
                    </div>
                  </Td>
                </tr>
              )}

              {/* Empty state */}
              {!qEmployees.isLoading && !qEmployees.isError && rows.length === 0 && (
                <tr className="border-t">
                  <Td colSpan={11}>
                    <div className="p-8 text-center text-gray-500">No employees found.</div>
                  </Td>
                </tr>
              )}

              {/* Data rows */}
              {!qEmployees.isLoading &&
                !qEmployees.isError &&
                rows.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-gray-50/60">
                    <Td>{e.id}</Td>

                    <Td className="min-w-[14rem]">
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-gray-500">{e.email ?? "—"}</div>
                    </Td>

                    <Td>{e.email ?? "—"}</Td>
                    <Td>{e.phone ?? "—"}</Td>
                    <Td>{e.role ?? "—"}</Td>

                    {/* Type — shown on lg+ */}
                    <Td className="hidden lg:table-cell">{e.type ?? "—"}</Td>
                    {/* Table code — md+ */}
                    <Td className="hidden md:table-cell">{e.tableCode ?? "—"}</Td>
                    {/* Active badge — md+ */}
                    <Td className="hidden md:table-cell">
                      {e.active == null ? (
                        "—"
                      ) : (
                        <span
                          className={
                            e.active
                              ? "inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                              : "inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
                          }
                        >
                          {e.active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </Td>

                    <Td>{money(e.baseSalary)}</Td>
                    <Td>{new Date(e.createdAt).toLocaleDateString()}</Td>

                    {/* Actions */}
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          className="inline-flex items-center rounded-lg px-2 py-1 hover:bg-gray-100"
                          title="Edit"
                          onClick={() => onEdit(e)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="inline-flex items-center rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          title="Delete permanently"
                          onClick={() => onDelete(e)}
                          disabled={mDelete.isPending}
                          aria-busy={mDelete.isPending ? "true" : "false"}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete permanently</span>
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableWrap>

        {/* ✅ PAGINATION (stacks on mobile) */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            Page {page} of {pages} • {total} total
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={onPrev}
              disabled={page <= 1 || qEmployees.isFetching}
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={onNext}
              disabled={page >= pages || qEmployees.isFetching}
              className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ✅ CREATE EMPLOYEE DRAWER (UI tweak: stable key to remount) */}
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Create employee">
        {createOpen && (
          <EmployeeForm
            key="create"
            mode="create"
            onSuccess={() => {
              setCreateOpen(false);
              qEmployees.refetch();
              setBanner({ tone: "success", text: "Employee created." });
            }}
            onCancel={() => setCreateOpen(false)}
          />
        )}
      </Drawer>

      {/* ✅ EDIT EMPLOYEE DRAWER (UI tweak: remount per row) */}
      <Drawer open={editOpen} onClose={() => setEditOpen(false)} title="Edit employee">
        {editRow && (
          <EmployeeForm
            key={`edit-${editRow.id}`}
            mode="edit"
            employeeId={String(editRow.id)}
            initial={{
              name: editRow.name,
              role: editRow.role,
              type: (editRow.type as any) ?? "INSIDE",
              tableCode: editRow.tableCode ?? undefined,
              phone: editRow.phone ?? undefined,
              salaryMonthly:
                typeof editRow.baseSalary === "number"
                  ? editRow.baseSalary
                  : Number(editRow.baseSalary ?? 0),
              active: typeof editRow.active === "boolean" ? editRow.active : true,
            }}
            onSuccess={() => {
              setEditOpen(false);
              setEditRow(null);
              qEmployees.refetch();
              setBanner({ tone: "success", text: "Employee updated." });
            }}
            onCancel={() => {
              setEditOpen(false);
              setEditRow(null);
            }}
          />
        )}
      </Drawer>
    </DashboardShell>
  );
}
