import { Router, Request, Response } from "express";
import { PrismaClient, EmployeeType } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// FIELD commission brackets (flat per-dispatch)
const COMMISSION_BRACKETS = [
  { from: 100,   to: 500,    amount: 100 },
  { from: 501,   to: 750,    amount: 200 },
  { from: 751,   to: 1000,   amount: 300 },
  { from: 1001,  to: 1500,   amount: 350 },
  { from: 1501,  to: 2000,   amount: 400 },
  { from: 2001,  to: 2500,   amount: 450 },
  { from: 2501,  to: 3000,   amount: 500 },
  { from: 3001,  to: 3500,   amount: 550 },
  { from: 3501,  to: 4000,   amount: 600 },
  { from: 4001,  to: 4500,   amount: 650 },
  { from: 4501,  to: 5000,   amount: 700 },
  { from: 5001,  to: 5500,   amount: 750 },
  { from: 5501,  to: 6000,   amount: 800 },
  { from: 6001,  to: 6500,   amount: 850 },
  { from: 6501,  to: 7000,   amount: 900 },
  { from: 7001,  to: 7500,   amount: 950 },
  { from: 7501,  to: 8000,   amount: 1000 },
  { from: 8001,  to: 8500,   amount: 1050 },
  { from: 8501,  to: 9000,   amount: 1100 },
  { from: 9001,  to: 9500,   amount: 1150 },
  { from: 9501,  to: 10000,  amount: 1200 },
] as const;

function commissionFor(amount: number): number {
  for (const b of COMMISSION_BRACKETS) {
    if (amount >= b.from && amount <= b.to) return b.amount;
  }
  return 0;
}

function monthRange(year: number, month1to12: number) {
  const start = new Date(year, month1to12 - 1, 1, 0, 0, 0, 0);
  const end   = new Date(year, month1to12, 0, 23, 59, 59, 999); // last day of month
  return { start, end };
}

/**
 * POST /api/payroll/run?year=YYYY&month=MM[&overwrite=true]
 *
 * Strategy
 * - Gather all FIELD dispatches in month that have a return.
 * - For each dispatch: soldQty = qtyDispatched - qtyReturned - lossQty
 *   soldAmount = soldQty * priceEach
 *   commission = bracket(soldAmount)
 * - Sum commission per employee => gross
 * - Sum SalaryDeductions per employee in the month => deductionsApplied
 * - carryForward = max(0, deductionsApplied - gross)
 * - netPay = max(0, gross - deductionsApplied)
 * - Create a unique PayrollRun(periodYear, periodMonth) with PayrollLine rows.
 *   If run exists:
 *     - if overwrite=true, delete it then recreate.
 *     - else 409 with existing run.
 */
router.post("/run", async (req: Request, res: Response) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    // accept either ?overwrite=true or ?rerun=true (backwards-compatibility)
    const qOverwrite = String(req.query.overwrite ?? "").toLowerCase();
    const qRerun = String(req.query.rerun ?? "").toLowerCase();
    const overwrite = qOverwrite === "true" || qRerun === "true";


    if (!year || !month || Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: "year and month are required (month 1..12)" });
    }

    const existing = await prisma.payrollRun.findUnique({
      where: { unique_period: { periodYear: year, periodMonth: month } },
      include: { lines: true },
    });
    if (existing && !overwrite) {
      return res.status(409).json({ error: "run_exists", run: existing });
    }

    const { start, end } = monthRange(year, month);

    // 1) Get FIELD dispatches with returns in the month
    const dispatches = await prisma.fieldDispatch.findMany({
      where: { date: { gte: start, lte: end } },
      include: {
        return: true,
        waiter: { select: { id: true, name: true, type: true, active: true } },
      },
    });

    // Aggregate monthly commission per FIELD employee
    const commissionByEmployee = new Map<number, number>();
    for (const d of dispatches) {
      if (!d.return) continue;
      if (d.waiter?.type !== EmployeeType.FIELD) continue; // ensure FIELD only

      const qtyDispatched = Number(d.qtyDispatched);
      const priceEach = Number(d.priceEach);
      const qRet = Number(d.return.qtyReturned);
      const lQty = Number(d.return.lossQty);

      const soldQty = qtyDispatched - qRet - lQty;
      const soldAmount = Number((soldQty * priceEach).toFixed(2));
      const comm = commissionFor(soldAmount);

      const prev = commissionByEmployee.get(d.waiterId) ?? 0;
      commissionByEmployee.set(d.waiterId, prev + comm);
    }

    // 2) Sum salary deductions per employee in the month
    const deductionsRaw = await prisma.salaryDeduction.findMany({
      where: { date: { gte: start, lte: end } },
      select: { employeeId: true, amount: true },
    });
    const deductionsByEmployee = new Map<number, number>();
    for (const r of deductionsRaw) {
      const amt = Number(r.amount);
      const prev = deductionsByEmployee.get(r.employeeId) ?? 0;
      deductionsByEmployee.set(r.employeeId, prev + amt);
    }

    // 3) Determine all employees to include (FIELD employees with any activity)
    const employeeIds = new Set<number>([
      ...commissionByEmployee.keys(),
      ...deductionsByEmployee.keys(),
    ]);
    if (employeeIds.size === 0) {
      // No activity; optionally still create an empty run.
      if (!existing || overwrite) {
        const run = await prisma.payrollRun.create({
          data: { periodYear: year, periodMonth: month },
        });
        return res.status(201).json({ ok: true, run: { ...run, lines: [] } });
      }
      return res.status(200).json({ ok: true, run: { ...existing, lines: existing.lines } });
    }

    // Fetch employees to ensure they exist (and to optionally validate FIELD type)
    const employees = await prisma.employee.findMany({
      where: { id: { in: Array.from(employeeIds) }, type: EmployeeType.FIELD },
      select: { id: true },
    });
    const validIds = new Set(employees.map(e => e.id));

    // 4) Create (or overwrite) run + lines atomically
    const created = await prisma.$transaction(async (tx) => {
      // Overwrite behavior
      if (existing && overwrite) {
        await tx.payrollRun.delete({
          where: { id: existing.id }, // lines cascade delete
        });
      }

      const run = await tx.payrollRun.create({
        data: { periodYear: year, periodMonth: month },
      });

      // Insert lines
      for (const empId of employeeIds) {
        if (!validIds.has(empId)) continue; // ignore non-FIELD or deleted employees

        const gross = Number((commissionByEmployee.get(empId) ?? 0).toFixed(2));
        const deductionsApplied = Number((deductionsByEmployee.get(empId) ?? 0).toFixed(2));
        const carryForward = Math.max(0, deductionsApplied - gross);
        const netPay = Math.max(0, gross - deductionsApplied);

        await tx.payrollLine.create({
          data: {
            payrollRunId: run.id,
            employeeId: empId,
            gross: gross.toFixed(2),
            deductionsApplied: deductionsApplied.toFixed(2),
            carryForward: carryForward.toFixed(2),
            netPay: netPay.toFixed(2),
            note: null,
          },
        });
      }

      // Return run with lines
      const full = await tx.payrollRun.findUnique({
        where: { id: run.id },
        include: { lines: true },
      });

      return full!;
    });

    return res.status(existing && overwrite ? 200 : 201).json({ ok: true, run: created });
  } catch (err: any) {
    console.error("payroll:run error", err);
    return res.status(500).json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
