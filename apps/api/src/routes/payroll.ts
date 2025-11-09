// apps/api/src/routes/payroll.ts
import { Router } from "express";
import { PrismaClient, WaiterType, CommissionRole } from "@prisma/client";
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
   Commission helpers (BRACKETS ONLY)
============================================================================ */
type Bracket = { min: number; max: number; fixed: number };

function parseBracketsJson(raw: any): Bracket[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((b) => ({
        min: Number((b as any)?.min ?? NaN),
        max: Number((b as any)?.max ?? NaN),
        fixed: Number((b as any)?.fixed ?? NaN),
      }))
      .filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max) && Number.isFinite(b.fixed))
      .sort((a, b) => a.min - b.min);
  }
  try {
    return parseBracketsJson(JSON.parse(String(raw)));
  } catch {
    return [];
  }
}

async function getDefaultPlan(role: CommissionRole) {
  return prisma.commissionPlan.findFirst({ where: { role, isDefault: true } });
}

/** Inclusive bracket match: min <= value <= max */
function matchBracket(brackets: Bracket[], value: number): Bracket | null {
  for (const b of brackets) {
    if (value >= b.min && value <= b.max) return b;
  }
  return null;
}

/* ============================================================================
   Data aggregation (per-day)
============================================================================ */

/** Inside daily net per waiter.
 *  Primary: Shift (waiterType=INSIDE, netSales).
 *  Fallback: TableSale aggregate per waiter per date (gross - discount).
 */
async function getInsideDailyNet(start: Date, end: Date) {
  // PRIMARY: Shift
  const shifts = await prisma.shift.findMany({
    where: {
      waiterType: WaiterType.INSIDE,
      date: { gte: start, lt: end },
    },
    select: { employeeId: true, date: true, netSales: true },
  });

  const byEmpDay = new Map<number, Map<string, number>>();
  for (const r of shifts) {
    const id = Number(r.employeeId);
    const d = new Date(r.date);
    const key = d.toISOString().slice(0, 10);
    const amt = Number(r.netSales ?? 0);
    if (!byEmpDay.has(id)) byEmpDay.set(id, new Map());
    const m = byEmpDay.get(id)!;
    m.set(key, (m.get(key) ?? 0) + amt);
  }

  // If we already have data from Shift, return it.
  let hasAny = false;
  for (const m of byEmpDay.values()) { if (m.size) { hasAny = true; break; } }
  if (hasAny) return byEmpDay;

  // FALLBACK: TableSale → sum per waiter per date: (qty*priceEach) - discount
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      "waiterId"                                        AS "employeeId",
      DATE("date")                                      AS "d",
      COALESCE(SUM("qty" * COALESCE("priceEach",0)),0)  AS "gross",
      COALESCE(SUM(COALESCE("discount",0)),0)           AS "discount"
    FROM "TableSale"
    WHERE "date" >= $1 AND "date" < $2
    GROUP BY "waiterId", DATE("date")
    ORDER BY "waiterId", DATE("date");
    `,
    start,
    end
  );

  for (const r of rows) {
    const id = Number(r.employeeId);
    const key = String(r.d);
    const net = Math.max(Number(r.gross || 0) - Number(r.discount || 0), 0);
    if (!byEmpDay.has(id)) byEmpDay.set(id, new Map());
    const m = byEmpDay.get(id)!;
    m.set(key, (m.get(key) ?? 0) + net);
  }

  return byEmpDay; // Map<empId, Map<dateISO, net>>
}

/** Field daily cash per waiter by joining FieldReturn→FieldDispatch(waiterId).
 *  Your DB has NO fr.date column → use createdAt only.
 */
async function getFieldDailyCash(start: Date, end: Date) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    SELECT
      fd."waiterId"               AS "employeeId",
      DATE(fr."createdAt")        AS "d",
      COALESCE(SUM(fr."cashCollected"), 0) AS "cash"
    FROM "FieldReturn" fr
    JOIN "FieldDispatch" fd ON fd.id = fr."dispatchId"
    WHERE fr."createdAt" >= $1 AND fr."createdAt" < $2
    GROUP BY fd."waiterId", DATE(fr."createdAt")
    ORDER BY fd."waiterId", DATE(fr."createdAt");
    `,
    start,
    end
  );

  const map = new Map<number, Map<string, number>>();
  for (const r of rows) {
    const id = Number(r.employeeId);
    const key = String(r.d);
    const amt = Number(r.cash ?? 0);
    if (!map.has(id)) map.set(id, new Map());
    const inner = map.get(id)!;
    inner.set(key, (inner.get(key) ?? 0) + amt);
  }
  return map; // Map<empId, Map<dateISO, cash>>
}

/* ============================================================================
   Serializers
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

/** Fetch lines by run id.
 *  Try modern FK (`payrollRunId`). If none found, raw-query legacy `runId`.
 */
async function getLinesForRun(runId: number): Promise<any[]> {
  try {
    const modern = await (pline as any).findMany({
      where: { payrollRunId: runId },
      orderBy: { id: "asc" },
    });
    if (modern && modern.length) return modern;
  } catch {
    // ignore and try legacy
  }

  try {
    const legacy = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "PayrollLine" WHERE "runId" = $1 ORDER BY "id" ASC;`,
      runId
    );
    return legacy;
  } catch (e) {
    console.error("getLinesForRun legacy raw query failed:", e);
    return [];
  }
}

/* ============================================================================
   GET /api/payroll — list (paged)
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
   GET /api/payroll/:ym — fetch a run + lines (path YYYY-M)
============================================================================ */
r.get("/:ym", async (req, res) => {
  try {
    const [yRaw, mRaw] = String(req.params.ym).split("-");
    const y = Number(yRaw);
    const m = Number(mRaw);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
      return res.status(400).json({ error: "bad_ym_param" });
    }

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
   POST /api/payroll/run?year=YYYY&month=MM[&rerun=true] — ADMIN ONLY
   COMMISSION-ONLY (BRACKETS): sum of **daily** bracket payouts per employee.
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

    // Period range: [start, end)
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end   = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1, 0, 0, 0));

    const capPct = Number(process.env.PAYROLL_DEDUCTION_CAP_PCT ?? "100");

    const result = await prisma.$transaction(async (tx) => {
      // Idempotency
      if (rerun) {
        await tx.payrollRun.deleteMany({ where: { periodYear: year, periodMonth: month } });
      } else {
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

      // Active employees
      const employees = await tx.employee.findMany({
        where: { active: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });

      if (!sded) throw new Error("No deduction table (salaryDeduction or deduction) present.");

      // Load default bracket plans
      const [insidePlan, fieldPlan] = await Promise.all([
        getDefaultPlan(CommissionRole.INSIDE),
        getDefaultPlan(CommissionRole.FIELD),
      ]);
      const insideBr = parseBracketsJson(insidePlan?.bracketsJson);
      const fieldBr  = parseBracketsJson(fieldPlan?.bracketsJson);

      // Aggregate daily data
      const [insideMap, fieldMap] = await Promise.all([
        getInsideDailyNet(start, end),  // Map<empId, Map<dateISO, net>>
        getFieldDailyCash(start, end),  // Map<empId, Map<dateISO, cash>>
      ]);

      // Total deductions up to end
      const grouped = await (sded as any).groupBy({
        by: ["employeeId"],
        _sum: { amount: true },
        where: { date: { lt: end } },
      } as any);
      const byEmpDeductions: Record<number, number> = Object.create(null);
      grouped.forEach((g: any) => (byEmpDeductions[g.employeeId] = Number(g._sum.amount || 0)));

      // Sum already applied in prior runs
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

      // Compute lines: SUM of **daily bracket payouts** (inside + field)
      const toCreate = employees.map((e: any) => {
        const perDayInside = insideMap.get(e.id) ?? new Map<string, number>();
        const perDayField  = fieldMap.get(e.id)  ?? new Map<string, number>();

        let insideTotal = 0;
        for (const amt of perDayInside.values()) {
          const b = matchBracket(insideBr, Number(amt) || 0);
          if (b) insideTotal += b.fixed;
        }

        let fieldTotal = 0;
        for (const amt of perDayField.values()) {
          const b = matchBracket(fieldBr, Number(amt) || 0);
          if (b) fieldTotal += b.fixed;
        }

        const gross = insideTotal + fieldTotal;

        const totalDed = byEmpDeductions[e.id] || 0;
        const applied  = byEmpApplied[e.id] || 0;
        const outstanding = Math.max(0, totalDed - applied);

        const capAbs = capPct >= 100 ? Number.POSITIVE_INFINITY : Math.floor((capPct / 100) * gross);
        const cappedOutstanding = Math.min(outstanding, isFinite(capAbs) ? capAbs : outstanding);

        const deductionsApplied = Math.min(cappedOutstanding, gross);
        const netPay = Math.max(0, gross - deductionsApplied);
        const carryForward = Math.max(0, outstanding - deductionsApplied);

        const noteBits: string[] = [];
        noteBits.push("commission-only:daily-brackets");
        if (insideTotal > 0) noteBits.push("inside:fixed-brackets");
        if (fieldTotal  > 0) noteBits.push("field:fixed-brackets");
        if (carryForward > 0) noteBits.push("carryForward");

        return {
          payrollRunId: run.id,
          employeeId: e.id,
          gross,
          deductionsApplied,
          netPay,
          carryForward,
          note: noteBits.join(","),
        };
      });

      // Insert lines (typed path then legacy FK)
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
              runId: l.payrollRunId,       // legacy FK path
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
