// routes/fieldCommissionMonthly.ts
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/**
 * Legacy FIELD monthly commission endpoint — upgraded to honor per-employee
 * commission plans when present (falls back to the original static brackets).
 *
 * Endpoint (mounted as /field-commission/monthly in routes/index.ts):
 *  GET /?year=YYYY&month=MM&waiterId=optional
 *
 * Response (preserves original shape):
 * {
 *   ok: true,
 *   year: 2025,
 *   month: 11,
 *   range: { from: '2025-11-01', to: '2025-11-30' },
 *   totals: { soldAmount, commission, cashRemit },
 *   results: [ { waiterId, waiterName, soldAmount, commission, cashRemit, grossSales, activeDays }, ... ]
 * }
 */

/* --- original static fallback brackets (kept for safety) --- */
const STATIC_COMMISSION_BRACKETS = [
  { from: 100, to: 500, amount: 100 },
  { from: 501, to: 750, amount: 200 },
  { from: 751, to: 1000, amount: 300 },
  { from: 1001, to: 1500, amount: 350 },
  { from: 1501, to: 2000, amount: 400 },
  { from: 2001, to: 2500, amount: 450 },
  { from: 2501, to: 3000, amount: 500 },
  { from: 3001, to: 3500, amount: 550 },
  { from: 3501, to: 4000, amount: 600 },
  { from: 4001, to: 4500, amount: 650 },
  { from: 4501, to: 5000, amount: 700 },
  { from: 5001, to: 5500, amount: 750 },
  { from: 5501, to: 6000, amount: 800 },
  { from: 6001, to: 6500, amount: 850 },
  { from: 6501, to: 7000, amount: 900 },
  { from: 7001, to: 7500, amount: 950 },
  { from: 7501, to: 8000, amount: 1000 },
  { from: 8001, to: 8500, amount: 1050 },
  { from: 8501, to: 9000, amount: 1100 },
  { from: 9001, to: 9500, amount: 1150 },
  { from: 9501, to: 10000, amount: 1200 },
] as const;

/* --- robust bracket parsing & matching (same algorithm as canonical /commission router) --- */
type Bracket = { min: number; max: number; fixed: number };

function normalizeNumber(x: any) {
  if (x == null) return NaN;
  const s = String(x).replace(/[, \u00A0]+/g, "").trim();
  return Number(s);
}

function parseBrackets(raw: any): Bracket[] {
  if (!raw) return [];
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    return (arr as any[])
      .map((b) => ({
        min: normalizeNumber((b as any)?.min ?? (b as any)?.from),
        max: normalizeNumber((b as any)?.max ?? (b as any)?.to),
        fixed: normalizeNumber((b as any)?.fixed ?? (b as any)?.amount),
      }))
      .filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max) && Number.isFinite(b.fixed))
      .sort((a, b) => a.min - b.min);
  } catch (err) {
    return [];
  }
}

function matchBracket(brs: Bracket[], v: number): Bracket | null {
  if (!brs || brs.length === 0) return null;
  for (let i = 0; i < brs.length; i++) {
    const b = brs[i];
    const isLast = i === brs.length - 1;
    if (v >= b.min && (isLast ? v <= b.max : v < b.max)) return b;
  }
  return null;
}

/* --- month range helper (keeps original local-day semantic) --- */
function monthRangeLocal(year: number, month1to12: number) {
  const start = new Date(year, month1to12 - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month1to12, 0, 23, 59, 59, 999);
  return { start, end };
}

router.get("/monthly", async (req: Request, res: Response) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month); // 1..12
    if (!year || !month || Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: "year and month are required (month 1..12)" });
    }

    const { start, end } = monthRangeLocal(year, month);

    const where: any = { date: { gte: start, lte: end } };
    if (req.query.waiterId) {
      const wid = Number(req.query.waiterId);
      if (Number.isNaN(wid)) return res.status(400).json({ error: "waiterId must be a number" });
      where.waiterId = wid;
    }

    // Fetch dispatches for the month (only those with returns will be counted further)
    const dispatches = await prisma.fieldDispatch.findMany({
      where,
      include: {
        return: true,
        waiter: { select: { id: true, name: true } },
      },
      orderBy: { id: "asc" },
    });

    type Totals = {
      waiterId: number;
      waiterName: string;
      soldAmount: number;
      commission: number;
      cashRemit: number;
      grossSales?: number;
      daysActive: Set<string>;
    };

    const byWaiter = new Map<number, Totals>();

    // Prefetch unique employees for efficiency
    const waiterIds = Array.from(new Set(dispatches.map((d) => d.waiterId)));
    const employees = waiterIds.length
      ? await prisma.employee.findMany({ where: { id: { in: waiterIds } }, select: { id: true, commissionPlanId: true, name: true } })
      : [];
    const empMap = new Map<number, any>();
    for (const e of employees) empMap.set(e.id, e);

    // Prefetch default FIELD plan
    const defaultFieldPlan = await prisma.commissionPlan.findFirst({ where: { role: "FIELD", isDefault: true } });
    const defaultBrackets = parseBrackets(defaultFieldPlan?.bracketsJson ?? null);
    const defaultNormalizedBrackets = defaultBrackets.length
      ? defaultBrackets
      : STATIC_COMMISSION_BRACKETS.map((b) => ({ min: b.from, max: b.to, fixed: b.amount }));

    // Local helper to compute commission for a waiter and soldAmount
    async function computeCommission(waiterIdNum: number, soldAmount: number): Promise<number> {
      try {
        const emp = empMap.get(waiterIdNum);
        let plan: any = null;
        if (emp?.commissionPlanId) {
          plan = await prisma.commissionPlan.findUnique({ where: { id: emp.commissionPlanId } });
        } else {
          plan = defaultFieldPlan;
        }
        const brackets = parseBrackets(plan?.bracketsJson ?? null);
        const normalizedBrackets = brackets.length ? brackets : defaultNormalizedBrackets;
        const hit = matchBracket(normalizedBrackets, soldAmount);
        return hit ? Number(hit.fixed) : 0;
      } catch (err) {
        return 0;
      }
    }

    // Aggregate
    for (const d of dispatches) {
      if (!d.return) continue;

      const qtyDispatched = Number(d.qtyDispatched ?? 0);
      const priceEach = Number(d.priceEach ?? 0);
      const qRet = Number(d.return.qtyReturned ?? 0);
      const lQty = Number(d.return.lossQty ?? 0);
      const cash = Number(d.return.cashCollected ?? 0);

      const gross = qtyDispatched * priceEach;
      const soldQty = qtyDispatched - qRet - lQty;
      const soldAmount = Number((soldQty * priceEach || 0).toFixed(2));

      const comm = await computeCommission(d.waiterId, soldAmount);

      const wid = d.waiterId;
      const wname = d.waiter?.name ?? `#${wid}`;

      const prev = byWaiter.get(wid) || {
        waiterId: wid,
        waiterName: wname,
        soldAmount: 0,
        commission: 0,
        cashRemit: 0,
        grossSales: 0,
        daysActive: new Set<string>(),
      };

      prev.soldAmount += soldAmount;
      prev.commission += comm;
      prev.cashRemit += cash;
      prev.grossSales = (prev.grossSales ?? 0) + gross;

      // calendar date (YYYY-MM-DD)
      const ymd = new Date(d.date).toISOString().slice(0, 10);
      prev.daysActive.add(ymd);

      byWaiter.set(wid, prev);
    }

    const results = Array.from(byWaiter.values()).map((r) => ({
      waiterId: r.waiterId,
      waiterName: r.waiterName,
      soldAmount: Number(r.soldAmount.toFixed(2)),
      commission: Number(r.commission.toFixed(2)),
      cashRemit: Number(r.cashRemit.toFixed(2)),
      grossSales: Number((r.grossSales ?? 0).toFixed(2)),
      activeDays: r.daysActive.size,
    }));

    // Grand totals
    const totalSoldAmount = results.reduce((s, r) => s + r.soldAmount, 0);
    const totalCommission = results.reduce((s, r) => s + r.commission, 0);
    const totalCashRemit = results.reduce((s, r) => s + r.cashRemit, 0);

    return res.json({
      ok: true,
      year,
      month,
      range: {
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
      },
      totals: {
        soldAmount: Number(totalSoldAmount.toFixed(2)),
        commission: Number(totalCommission.toFixed(2)),
        cashRemit: Number(totalCashRemit.toFixed(2)),
      },
      results,
    });
  } catch (err: any) {
    console.error("field-commission:monthly error", err);
    return res.status(500).json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
