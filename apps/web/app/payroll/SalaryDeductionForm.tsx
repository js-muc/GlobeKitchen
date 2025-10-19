// ✅ SALARY_DEDUCTION_FORM — apps/web/app/payroll/SalaryDeductionForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createSalaryDeduction,
  type CreateSalaryDeductionInput,
  type SalaryDeductionReason,
  listEmployees,
  type EmployeesResponse,
} from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/components/hooks/useDebounce";

const schema = z.object({
  employeeId: z.number({ invalid_type_error: "Employee is required" }).int().positive(),
  date: z.string().min(10, "Date is required"),
  amount: z.number({ invalid_type_error: "Amount is required" }).positive("Must be > 0"),
  reason: z.enum(["ADVANCE", "LOSS", "BREAKAGE", "OTHER"], { required_error: "Reason is required" }),
  note: z.string().trim().optional(),
  meta: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  onSuccess?: () => void;
  onCancel?: () => void;
  presetEmployeeId?: number;
};

export default function SalaryDeductionForm({ onSuccess, onCancel, presetEmployeeId }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeId: presetEmployeeId ?? 0,
      date: new Date().toISOString().slice(0, 10), // yyyy-mm-dd (browser friendly)
      amount: 0,
      reason: "ADVANCE",
      note: "",
      meta: "",
    },
  });

  // simple employee search dropdown
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 300);
  const { data: empData } = useQuery<EmployeesResponse>({
    queryKey: ["employees-mini", { q: dq }],
    queryFn: () => listEmployees({ page: 1, limit: 50, q: dq }),
    staleTime: 10_000,
  });

  const employees = empData?.employees ?? [];
  const selectedId = watch("employeeId");

  useEffect(() => {
    if (presetEmployeeId) setValue("employeeId", presetEmployeeId);
  }, [presetEmployeeId, setValue]);

  const onSubmit = async (v: FormValues) => {
    const input: CreateSalaryDeductionInput = {
      employeeId: v.employeeId,
      date: new Date(v.date).toISOString(),
      amount: v.amount,
      reason: v.reason as SalaryDeductionReason,
      note: v.note || undefined,
      meta: v.meta || undefined,
    };
    await createSalaryDeduction(input);
    onSuccess?.();
  };

  const selectedName = useMemo(
    () => employees.find((e) => e.id === selectedId)?.name ?? "",
    [employees, selectedId]
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Employee select + search */}
      <div className="grid gap-2">
        <label className="text-sm font-medium">Employee</label>
        <input
          placeholder="Search employee (name / phone / email)…"
          className="w-full rounded-xl border px-3 py-2"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="w-full rounded-xl border px-3 py-2"
          {...register("employeeId", { valueAsNumber: true })}
        >
          <option value={0} disabled>
            Select employee…
          </option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} {e.phone ? `• ${e.phone}` : ""}
            </option>
          ))}
        </select>
        {errors.employeeId && <p className="text-sm text-rose-600">{errors.employeeId.message}</p>}
        {selectedName && <p className="text-xs text-gray-500">Selected: {selectedName}</p>}
      </div>

      {/* Date + Amount */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Date</span>
          <input type="date" className="rounded-xl border px-3 py-2" {...register("date")} />
          {errors.date && <p className="text-sm text-rose-600">{errors.date.message}</p>}
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Amount (KSh)</span>
          <input
            type="number"
            min={1}
            step="1"
            className="rounded-xl border px-3 py-2"
            {...register("amount", { valueAsNumber: true })}
          />
          {errors.amount && <p className="text-sm text-rose-600">{errors.amount.message}</p>}
        </label>
      </div>

      {/* Reason */}
      <div>
        <label className="block text-sm font-medium mb-1">Reason</label>
        <select className="w-full rounded-xl border px-3 py-2" {...register("reason")}>
          <option value="ADVANCE">Salary Advance</option>
          <option value="LOSS">Loss</option>
          <option value="BREAKAGE">Breakage</option>
          <option value="OTHER">Other</option>
        </select>
        {errors.reason && <p className="text-sm text-rose-600">{errors.reason.message}</p>}
      </div>

      {/* Note / Meta */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Note (optional)</span>
          <input className="rounded-xl border px-3 py-2" {...register("note")} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-medium">Meta (optional)</span>
          <input className="rounded-xl border px-3 py-2" {...register("meta")} />
        </label>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border px-4 py-2 hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-[color:var(--color-brand)] px-4 py-2 text-white hover:brightness-110 disabled:opacity-50"
        >
          {isSubmitting ? "Saving…" : "Save deduction"}
        </button>
      </div>
    </form>
  );
}
