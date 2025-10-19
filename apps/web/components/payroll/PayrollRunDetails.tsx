// ✅ PAYROLL_RUN_DETAILS — apps/web/components/payroll/PayrollRunDetails.tsx
"use client";

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPayrollByYm, type PayrollRun, type PayrollLine } from "@/lib/api";
import Drawer from "@/components/ui/Drawer";
import { useEmployeesIndex } from "@/components/hooks/useEmployeesIndex";
import { AlertTriangle } from "lucide-react";

/* ----------------------- helpers ----------------------- */
function n(v: string | number | null | undefined) {
  const num = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(num as number) ? (num as number).toLocaleString() : "—";
}

type Props = {
  open: boolean;
  ym: string | null; // "YYYY-MM"
  onClose: () => void;
};

export default function PayrollRunDetails({ open, ym, onClose }: Props) {
  const enabled = open && !!ym;

  const qRun = useQuery<PayrollRun>({
    queryKey: ["payroll", ym],
    queryFn: () => getPayrollByYm(ym as string),
    enabled,
    staleTime: 10_000,
  });

  const { map: names } = useEmployeesIndex();

  const totals = useMemo(() => {
    const lines = qRun.data?.lines ?? [];
    const sum = (sel: (l: PayrollLine) => number) =>
      lines.reduce((acc, l) => acc + sel(l), 0);
    return {
      gross: sum((l) => Number(l.gross || 0)),
      ded: sum((l) => Number(l.deductionsApplied || 0)),
      cf: sum((l) => Number(l.carryForward || 0)),
      net: sum((l) => Number(l.netPay || 0)),
    };
  }, [qRun.data?.lines]);

  const runMeta = qRun.data
    ? {
        runAt: new Date(qRun.data.runAt).toLocaleString(),
        createdAt: new Date(qRun.data.createdAt).toLocaleString(),
      }
    : null;

  return (
    <Drawer open={open} onClose={onClose} title={`Payroll • ${ym ?? ""}`}>
      <div className="space-y-4">
        {/* Meta */}
        {runMeta && (
          <div className="grid gap-1 text-sm text-gray-600 sm:grid-cols-2">
            <div>Run at: {runMeta.runAt}</div>
            <div>Created: {runMeta.createdAt}</div>
          </div>
        )}

        {/* States */}
        {qRun.isLoading && <div className="text-gray-600">Loading run…</div>}
        {qRun.isError && !qRun.isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            Failed to load payroll run.
          </div>
        )}

        {/* Lines */}
        {!!qRun.data?.lines?.length && (
          <div className="overflow-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Deductions</th>
                  <th className="px-3 py-2 text-right">Carry fwd</th>
                  <th className="px-3 py-2 text-right">Net pay</th>
                  <th className="hidden px-3 py-2 text-left md:table-cell">Note</th>
                </tr>
              </thead>
              <tbody>
                {qRun.data.lines!.map((ln) => {
                  const empName = names.get(ln.employeeId) ?? `#${ln.employeeId}`;
                  const note = ln.note ?? "—";
                  return (
                    <tr key={ln.id} className="border-t align-top hover:bg-gray-50/60">
                      {/* Employee & (mobile) note */}
                      <td className="px-3 py-2">
                        <div className="font-medium">{empName}</div>
                        <div className="text-xs text-gray-500">ID: {ln.employeeId}</div>

                        {/* On small screens, show the note under the employee */}
                        <div className="mt-1 text-xs text-gray-600 md:hidden">
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5">
                            {note}
                          </span>
                        </div>
                      </td>

                      <td className="px-3 py-2 text-right">{n(ln.gross)}</td>
                      <td className="px-3 py-2 text-right">{n(ln.deductionsApplied)}</td>
                      <td className="px-3 py-2 text-right">{n(ln.carryForward)}</td>
                      <td className="px-3 py-2 text-right font-medium">{n(ln.netPay)}</td>

                      {/* Desktop note column */}
                      <td className="hidden px-3 py-2 md:table-cell">
                        {note === "—" ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <span
                            className="inline-block max-w-[32rem] truncate align-top"
                            title={note}
                          >
                            {note}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50">
                  <td className="px-3 py-2 font-medium">Totals</td>
                  <td className="px-3 py-2 text-right font-medium">{n(totals.gross)}</td>
                  <td className="px-3 py-2 text-right font-medium">{n(totals.ded)}</td>
                  <td className="px-3 py-2 text-right font-medium">{n(totals.cf)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{n(totals.net)}</td>
                  <td className="hidden px-3 py-2 md:table-cell">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!qRun.isLoading &&
          !qRun.isError &&
          (!qRun.data?.lines || qRun.data.lines.length === 0) && (
            <div className="rounded-xl border bg-white p-6 text-center text-gray-500">
              No lines.
            </div>
          )}
      </div>
    </Drawer>
  );
}
