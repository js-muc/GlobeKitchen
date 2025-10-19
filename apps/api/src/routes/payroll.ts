// apps/api/src/routes/payroll.ts
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { zPayrollRunParams, zPayrollRerun } from "../schemas/payroll.js";
import { getPageParams, pageMeta, moneyStr } from "./_payroll.util.js";

const prisma = new PrismaClient();
const r = Router();

/* ============================================================================
   Dynamic delegates (tolerant to local Prisma type drift)
============================================================================ */
const $ = prisma as any;
const prun = $.payrollRun as any;                 // PayrollRun
const pline = $.payrollLine as any;               // PayrollLine
const sded  = $.salaryDeduction ?? $.deduction;   // unified or legacy table
const emp   = $.employee as any;                  // Employee

if (!prun || !pline || !emp) {
  throw new Error("Prisma delegates missing. Run `pnpm prisma generate` in apps/api on the host.");
}

/* ============================================================================
   Helpers
============================================================================ */
function serializeLine(row: any) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    gross: moneyStr(row.gross),
    deductionsApplied: moneyStr(row.deductionsApplied),
    carryForward: moneyStr(row.carryForward),
    netPay: moneyStr(row.netPay),
    note: row.note ?? null,
    createdAt: row.createdAt,
  };
}

function serializeRun(run: any, lines: any[] = []) {
  return {
    id: run.id,
    periodYear: run.periodYear,
    periodMonth: run.periodMonth,
    runAt: run.runAt,
    createdAt: run.createdAt,
    lines: lines.map(serializeLine),
  };
}

/** Fetch lines by run id; supports both `payrollRunId` and legacy `runId`. */
async function getLinesForRun(runId: number): Promise<any[]> {
  try {
    return await (pline as any).findMany({
      where: { payrollRunId: runId },
      orderBy: { id: "asc" },
    });
  } catch {
    try {
      return await (pline as any).findMany(
        { where: { runId }, orderBy: { id: "asc" } } as any
      );
    } catch (e) {
      console.error("getLinesForRun failed for both FK names:", e);
      return [];
    }
  }
}

/**
 * Robustly resolve a PayrollRun by (year, month).
 * Tries the named compound unique key first, falls back to findFirst.
 */
async function getRunByPeriod(client: any, year: number, month: number) {
  // Try named compound unique key (recommended)
  try {
    return await client.payrollRun.findUnique({
      where: { unique_period: { periodYear: year, periodMonth: month } },
    });
  } catch (e: any) {
    // If the generated client doesn’t recognize the named key yet,
    // fall back to findFirst (functionally equivalent for our purpose).
    return await client.payrollRun.findFirst({
      where: { periodYear: year, periodMonth: month },
    });
  }
}

/* ============================================================================
   GET /api/payroll — list (paged; optional year/month filters)
============================================================================ */
r.get("/", async (req, res) => {
  try {
    const year = req.query.year !== undefined ? Number(req.query.year) : undefined;
    const month = req.query.month !== undefined ? Number(req.query.month) : undefined;

    const where: any = {};
    if (Number.isFinite(year)) where.periodYear = year;
    if (Number.isFinite(month)) where.periodMonth = month;

    const { page, limit, skip, take } = getPageParams(req.query);

    const [rows, total] = await Promise.all([
      prun.findMany({
        where,
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        skip,
        take,
      }),
      prun.count({ where }),
    ]);

    return res.json({ data: rows, meta: pageMeta(total, page, limit) });
  } catch (e) {
    console.error("GET /api/payroll error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ============================================================================
   GET /api/payroll/:ym — fetch a run + lines (path YYYY-M, no leading zero)
============================================================================ */
r.get("/:ym", async (req, res) => {
  try {
    const [yRaw, mRaw] = String(req.params.ym).split("-");
    const y = Number(yRaw);
    const m = Number(mRaw);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: "bad_ym_param" });
    }

    // apps/api/src/routes/payroll.ts  (GET /:ym)
    const run = await prun.findFirst({ where: { periodYear: y, periodMonth: m } });
    if (!run) return res.status(404).json({ error: "payroll_run_not_found" });

    const lines = await getLinesForRun(run.id);
    return res.json(serializeRun(run, lines));
  } catch (e) {
    console.error("GET /api/payroll/:ym error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ============================================================================
   POST /api/payroll/run?year=YYYY&month=MM[&rerun=true] — admin only
   - Idempotent when rerun=true (deletes existing for the period)
============================================================================ */
r.post("/run", writeLimiter, requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = zPayrollRunParams.safeParse({
      year: req.query.year,
      month: req.query.month,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", detail: parsed.error.message });
    }
    const { year, month } = parsed.data;

    const { rerun = false } = zPayrollRerun.parse({ rerun: req.query.rerun });
    const userId: number | undefined = (req as any).user?.id;

    // End of period (exclusive): first day of next month at 00:00:00 UTC
    const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1, 0, 0, 0));

    // Optional deduction cap (% of gross). Default 100 = no cap
    const capPct = Number(process.env.PAYROLL_DEDUCTION_CAP_PCT ?? "100");

    const result = await prisma.$transaction(async (tx) => {
      // Idempotency / conflict-safe
      if (rerun) {
        await tx.payrollRun.deleteMany({ where: { periodYear: year, periodMonth: month } });
      } else {
        // Robust existence check: try unique key, fall back
        let already: any = null;
        try {
          already = await tx.payrollRun.findUnique({
            where: { unique_period: { periodYear: year, periodMonth: month } },
            select: { id: true },
          });
        } catch {
          already = await tx.payrollRun.findFirst({
            where: { periodYear: year, periodMonth: month },
            select: { id: true },
          });
        }
        if (already) {
          const err: any = new Error("RUN_EXISTS");
          err.code = "RUN_EXISTS";
          throw err;
        }
      }

      // Active salaried employees
      const employees = await tx.employee.findMany({
        where: { active: true, salaryMonthly: { gt: "0" } },
        orderBy: { id: "asc" },
        select: { id: true, salaryMonthly: true },
      });

      if (!sded) throw new Error("No deduction table (salaryDeduction or deduction) present.");

      // Sum of all deductions up to end (grouped by employee)
      const grouped = await (sded as any).groupBy({
        by: ["employeeId"],
        _sum: { amount: true },
        where: { date: { lt: end } },
      } as any);
      const byEmpDeductions: Record<number, number> = Object.create(null);
      grouped.forEach((g: any) => (byEmpDeductions[g.employeeId] = Number(g._sum.amount || 0)));

      // Sum already applied in prior runs (deductionsApplied)
      const prevRuns = await tx.payrollRun.findMany({
        where: {
          OR: [{ periodYear: { lt: year } }, { periodYear: year, periodMonth: { lt: month } }],
        },
        select: { id: true },
      });
      const prevIds = prevRuns.map((r: any) => r.id);

      const byEmpApplied: Record<number, number> = Object.create(null);
      if (prevIds.length) {
        let prevLines: any[] = [];
        try {
          prevLines = await (tx as any).payrollLine.groupBy({
            by: ["employeeId"],
            _sum: { deductionsApplied: true },
            where: { payrollRunId: { in: prevIds } },
          } as any);
        } catch {
          // Legacy FK name: runId
          prevLines = await (tx as any).payrollLine.groupBy({
            by: ["employeeId"],
            _sum: { deductionsApplied: true },
            where: { runId: { in: prevIds } },
          } as any);
        }
        prevLines.forEach((l: any) => (byEmpApplied[l.employeeId] = Number(l._sum.deductionsApplied || 0)));
      }

      // Create run
      const runData: any = { periodYear: year, periodMonth: month, runAt: new Date() };
      if (userId !== undefined && userId !== null) runData.createdByUserId = userId;
      const run = await tx.payrollRun.create({ data: runData });

      // Compute lines (original math + optional cap)
      const toCreate = employees.map((e: any) => {
        const gross = Number(e.salaryMonthly || 0);
        const totalDed = byEmpDeductions[e.id] || 0;
        const applied = byEmpApplied[e.id] || 0;
        const outstanding = Math.max(0, totalDed - applied);

        const cappedOutstanding =
          capPct >= 100 ? outstanding : Math.min(outstanding, Math.floor((capPct / 100) * gross));

        const deductionsApplied = Math.min(cappedOutstanding, gross);
        const netPay = Math.max(0, gross - deductionsApplied);
        const carryForward = Math.max(0, outstanding - deductionsApplied);

        return {
          payrollRunId: run.id,
          employeeId: e.id,
          gross,
          deductionsApplied,
          netPay,
          carryForward,
          note: carryForward > 0 ? "Carry forward deductions to next month" : null,
        };
      });

      // Insert lines — typed path first; untyped fallback for legacy FK
      if (toCreate.length) {
        try {
          await tx.payrollLine.createMany({
            data: toCreate.map((l) => ({
              payrollRunId: l.payrollRunId,
              employeeId: l.employeeId,
              gross: l.gross as any,
              deductionsApplied: l.deductionsApplied as any,
              netPay: l.netPay as any,
              carryForward: l.carryForward as any,
              note: l.note,
            })),
          });
        } catch {
          await (tx as any).payrollLine.createMany({
            data: toCreate.map((l) => ({
              runId: l.payrollRunId, // legacy FK
              employeeId: l.employeeId,
              gross: l.gross,
              deductionsApplied: l.deductionsApplied,
              netPay: l.netPay,
              carryForward: l.carryForward,
              note: l.note,
            })),
          } as any);
        }
      }

      const createdLines = await getLinesForRun(run.id);
      return serializeRun(run, createdLines);
    });

    return res.status(201).json(result);
  } catch (e: any) {
    if (e?.code === "RUN_EXISTS") return res.status(409).json({ error: "payroll_already_exists" });
    if (e?.code === "P2002") return res.status(409).json({ error: "payroll_already_exists" });
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "validation_error", detail: e.message });
    }
    console.error("POST /api/payroll/run error:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default r;
