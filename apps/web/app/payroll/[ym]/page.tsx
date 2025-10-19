// ✅ PAYROLL_DETAIL — apps/web/app/payroll/[ym]/page.tsx
"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getPayrollByYm, type PayrollRun } from "@/lib/api";
import DashboardShell from "@/components/layout/DashboardShell";
import { FileText } from "lucide-react";
import { notFound, useParams } from "next/navigation";

export default function PayrollDetailPage() {
  const { ym } = useParams<{ ym: string }>(); // "2025-09"
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) notFound();

  const qRun = useQuery<PayrollRun>({
    queryKey: ["payroll", ym],
    queryFn: () => getPayrollByYm(ym),
    staleTime: 10_000,
  });

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-[color:var(--color-brand)]/10">
            <FileText className="h-5 w-5 text-[color:var(--color-brand)]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold leading-6">Payroll • {ym}</h1>
            <p className="text-sm text-gray-600">
              Run at {qRun.data ? new Date(qRun.data.runAt).toLocaleString() : "—"}
            </p>
          </div>
        </div>

        <div className="overflow-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Employee ID</th>
                <th className="px-3 py-2 text-right">Gross</th>
                <th className="px-3 py-2 text-right">Deductions</th>
                <th className="px-3 py-2 text-right">Carry forward</th>
                <th className="px-3 py-2 text-right">Net pay</th>
                <th className="px-3 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {qRun.isLoading && (
                <tr className="border-t">
                  <td className="px-3 py-3 text-gray-500" colSpan={6}>Loading…</td>
                </tr>
              )}
              {qRun.isError && !qRun.isLoading && (
                <tr className="border-t">
                  <td className="px-3 py-3 text-rose-700" colSpan={6}>Failed to load payroll run.</td>
                </tr>
              )}
              {qRun.data?.lines?.length
                ? qRun.data.lines.map((ln) => (
                    <tr key={ln.id} className="border-t hover:bg-gray-50/60">
                      <td className="px-3 py-2">{ln.employeeId}</td>
                      <td className="px-3 py-2 text-right">{Number(ln.gross).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{Number(ln.deductionsApplied).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{Number(ln.carryForward).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-medium">{Number(ln.netPay).toLocaleString()}</td>
                      <td className="px-3 py-2">{ln.note ?? "—"}</td>
                    </tr>
                  ))
                : !qRun.isLoading && (
                    <tr className="border-t">
                      <td className="px-3 py-6 text-center text-gray-500" colSpan={6}>No lines.</td>
                    </tr>
                  )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
