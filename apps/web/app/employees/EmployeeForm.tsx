// apps/web/app/employees/EmployeeForm.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  createEmployee,
  updateEmployee,
  type CreateEmployeeInput,
} from "@/lib/api";
import { AlertTriangle } from "lucide-react";

/** Props */
type Props = {
  mode: "create" | "edit";
  employeeId?: string; // required when mode="edit"
  initial?: {
    name: string;
    role: string;
    type: "INSIDE" | "FIELD" | "CHEF";
    tableCode?: string;
    phone?: string;
    salaryMonthly: number; // UI number
    active?: boolean;
  };
  onSuccess: () => void;
  onCancel?: () => void;
};

const ROLES = ["WAITER", "CHEF", "CASHIER", "MANAGER", "KITCHEN"] as const;
// Keep the same type set you’ve been using in the project (“INSIDE” | “FIELD” | “CHEF”)
const TYPES = ["INSIDE", "FIELD", "CHEF"] as const;

/** Normalize & guard helpers */
const clampMoney = (n: number) => {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return n;
};

export default function EmployeeForm({
  mode,
  employeeId,
  initial,
  onSuccess,
  onCancel,
}: Props) {
  // ---------- Local form state ----------
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<string>(initial?.role ?? "WAITER");
  const [type, setType] = useState<(typeof TYPES)[number]>(initial?.type ?? "INSIDE");
  const [tableCode, setTableCode] = useState<string>(initial?.tableCode ?? "");
  const [phone, setPhone] = useState<string>(initial?.phone ?? "");
  const [salaryMonthly, setSalaryMonthly] = useState<number>(
    clampMoney(Number(initial?.salaryMonthly ?? 0))
  );
  const [active, setActive] = useState<boolean>(initial?.active ?? true);

  // ---------- UX state ----------
  const [formError, setFormError] = useState<string | null>(null);

  // When switching from edit->create or changing employee, refresh defaults
  useEffect(() => {
    setName(initial?.name ?? "");
    setRole(initial?.role ?? "WAITER");
    setType((initial?.type as any) ?? "INSIDE");
    setTableCode(initial?.tableCode ?? "");
    setPhone(initial?.phone ?? "");
    setSalaryMonthly(clampMoney(Number(initial?.salaryMonthly ?? 0)));
    setActive(initial?.active ?? true);
    setFormError(null);
  }, [initial, mode, employeeId]);

  // ---------- Derived payload ----------
  const payload: CreateEmployeeInput = useMemo(
    () => ({
      name: name.trim(),
      role: role as CreateEmployeeInput["role"],
      type,
      tableCode: tableCode.trim() || undefined,
      phone: phone.trim() || undefined,
      salaryMonthly: clampMoney(Number(salaryMonthly || 0)),
      active,
    }),
    [name, role, type, tableCode, phone, salaryMonthly, active]
  );

  // ---------- Mutations ----------
  const mCreate = useMutation({
    mutationFn: async () => {
      console.info("[EmployeeForm] create → payload", payload);
      const res = await createEmployee(payload);
      console.info("[EmployeeForm] create → success", res);
      return res;
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      console.error("[EmployeeForm] create → error", err);
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        (typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "") ||
        err?.message ||
        "Failed to create employee.";
      setFormError(msg);
    },
  });

  const mUpdate = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("Missing employeeId for edit.");
      console.info("[EmployeeForm] update → id, payload", employeeId, payload);
      const res = await updateEmployee(employeeId, payload);
      console.info("[EmployeeForm] update → success", res);
      return res;
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      console.error("[EmployeeForm] update → error", err);
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        (typeof err?.response?.data?.detail === "string"
          ? err.response.data.detail
          : "") ||
        err?.message ||
        "Failed to update employee.";
      setFormError(msg);
    },
  });

  // ---------- Submit ----------
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Basic client validation
    if (!payload.name) {
      setFormError("Name is required.");
      return;
    }
    if (!ROLES.includes(payload.role as any)) {
      setFormError("Please pick a valid role.");
      return;
    }
    if (!TYPES.includes(payload.type as any)) {
      setFormError("Please pick a valid type.");
      return;
    }
    if (!Number.isFinite(payload.salaryMonthly)) {
      setFormError("Salary must be a number.");
      return;
    }

    setFormError(null);
    if (mode === "create") mCreate.mutate();
    else mUpdate.mutate();
  };

  const busy = mCreate.isPending || mUpdate.isPending;

  // ---------- Render ----------
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Two columns on sm+, one column on mobile */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Name */}
        <label className="grid gap-1">
          <span className="text-sm font-medium">Name</span>
          <input
            className="rounded-xl border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Employee name"
            autoFocus
          />
        </label>

        {/* Role */}
        <label className="grid gap-1">
          <span className="text-sm font-medium">Role</span>
          <select
            className="rounded-xl border px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r[0] + r.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>

        {/* Type */}
        <label className="grid gap-1">
          <span className="text-sm font-medium">Type</span>
          <select
            className="rounded-xl border px-3 py-2"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0] + t.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>

        {/* Table code */}
        <label className="grid gap-1">
          <span className="text-sm font-medium">Table code (optional)</span>
          <input
            className="rounded-xl border px-3 py-2"
            value={tableCode}
            onChange={(e) => setTableCode(e.target.value)}
            placeholder="E.g., A7"
          />
        </label>

        {/* Phone */}
        <label className="grid gap-1">
          <span className="text-sm font-medium">Phone (optional)</span>
          <input
            className="rounded-xl border px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07XXXXXXXX"
            inputMode="tel"
          />
        </label>

        {/* Salary */}
        <label className="grid gap-1">
          <span className="text-sm font-medium">Monthly salary</span>
          <input
            className="rounded-xl border px-3 py-2"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={Number.isFinite(salaryMonthly) ? salaryMonthly : 0}
            onChange={(e) => setSalaryMonthly(Number(e.target.value))}
            placeholder="30000"
          />
        </label>

        {/* Active (edit only OR visible in create too, up to you) */}
        <label className="mt-2 flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span className="text-sm">Active</span>
        </label>
      </div>

      {/* Errors */}
      {(formError || mCreate.isError || mUpdate.isError) && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="text-sm">
            {formError ||
              (mCreate.error as any)?.message ||
              (mUpdate.error as any)?.message ||
              "Something went wrong."}
          </div>
        </div>
      )}

      {/* Actions (stack on mobile) */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="rounded-xl border px-4 py-2 hover:bg-gray-50"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-xl bg-[color:var(--color-brand)] px-4 py-2 text-white hover:brightness-110 disabled:opacity-50"
          disabled={busy}
          aria-busy={busy ? "true" : "false"}
        >
          {busy ? (mode === "create" ? "Creating…" : "Saving…") : mode === "create" ? "Create" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
