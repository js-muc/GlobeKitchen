// routes/fieldCommissionDaily.ts
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/**
 * Legacy FIELD daily commission endpoint — upgraded to honor per-employee
 * commission plans when present (falls back to the original static brackets).
 *
 * Endpoint (mounted as /field-commission/daily in routes/index.ts):
 *  GET /?date=YYYY-MM-DD&waiterId=optional
 *
 * Response (preserves original shape):
 * {
 *   ok: true,
 *   date: "YYYY-MM-DD",
 *   waiterId?: 123,
 *   totals: { soldAmount, commission, cashRemit },
 *   results: [ { waiterId, waiterName, soldAmount, commission, cashRemit, grossSales }, ... ]
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
      .map((b) => {
        return {
          min: normalizeNumber((b as any)?.min ?? (b as any)?.from),
          max: normalizeNumber((b as any)?.max ?? (b as any)?.to),
          fixed: normalizeNumber((b as any)?.fixed ?? (b as any)?.amount),
        };
      })
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

/* --- helper to compute commission for a waiter given soldAmount --- */
/**
 * Strategy:
 *  - If employee has a commissionPlanId => load that plan
 *  - else => load default FIELD plan (commissionPlan.role === 'FIELD' && isDefault === true)
 *  - extract brackets from plan.bracketsJson (only) — do NOT access non-existent 'brackets'
 *  - if no plan or brackets => fall back to STATIC_COMMISSION_BRACKETS behaviour
 */
async function commissionForWaiterId(waiterId: number, soldAmount: number): Promise<number> {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: waiterId },
      select: { id: true, commissionPlanId: true },
    });

    let plan: any = null;
    if (employee?.commissionPlanId) {
      plan = await prisma.commissionPlan.findUnique({ where: { id: employee.commissionPlanId } });
    } else {
      plan = await prisma.commissionPlan.findFirst({ where: { role: "FIELD", isDefault: true } });
    }

    // IMPORTANT: use only bracketsJson (brackets field may not exist in your schema)
    const brackets = parseBrackets(plan?.bracketsJson ?? null);
    const normalizedBrackets = brackets.length
      ? brackets
      : STATIC_COMMISSION_BRACKETS.map((b) => ({ min: b.from, max: b.to, fixed: b.amount }));

    const hit = matchBracket(normalizedBrackets, soldAmount);
    return hit ? Number(hit.fixed) : 0;
  } catch (err) {
    // Conservative fallback — no commission if something unexpected happens
    return 0;
  }
}

router.get("/daily", async (req: Request, res: Response) => {
  try {
    const { date, waiterId } = req.query;
    if (!date) return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });

    const day = new Date(String(date));
    if (isNaN(day.getTime())) return res.status(400).json({ error: "invalid date format" });

    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const where: any = { date: { gte: start, lte: end } };
    if (waiterId) {
      const wid = Number(waiterId);
      if (isNaN(wid)) return res.status(400).json({ error: "waiterId must be a number" });
      where.waiterId = wid;
    }

    // Fetch dispatches for the day, with returns + waiter info
    const dispatches = await prisma.fieldDispatch.findMany({
      where,
      include: {
        return: true, // may be null
        waiter: { select: { id: true, name: true } },
      },
      orderBy: { id: "asc" },
    });

    // Aggregate per waiter
    type Totals = {
      waiterId: number;
      waiterName: string;
      soldAmount: number; // sum of per-dispatch sold amounts
      commission: number; // sum of per-dispatch commission
      cashRemit: number; // sum of cashCollected
      grossSales?: number;
    };

    const byWaiter = new Map<number, Totals>();

    // For performance: collect unique waiterIds and prefetch their plans (optional)
    const waiterIds = Array.from(new Set(dispatches.map((d) => d.waiterId)));
    const employees = await prisma.employee.findMany({
      where: { id: { in: waiterIds } },
      select: { id: true, commissionPlanId: true, name: true },
    });
    const empMap = new Map<number, any>();
    for (const e of employees) empMap.set(e.id, e);

    // We'll also prefetch default FIELD plan once (avoid repeated DB hits)
    const defaultFieldPlan = await prisma.commissionPlan.findFirst({ where: { role: "FIELD", isDefault: true } });
    const defaultBrackets = parseBrackets(defaultFieldPlan?.bracketsJson ?? null);
    const defaultNormalizedBrackets = defaultBrackets.length
      ? defaultBrackets
      : STATIC_COMMISSION_BRACKETS.map((b) => ({ min: b.from, max: b.to, fixed: b.amount }));

    // Local helper that uses prefetched employee info when possible
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
        const normalizedBrackets = brackets.length
          ? brackets
          : defaultNormalizedBrackets;
        const hit = matchBracket(normalizedBrackets, soldAmount);
        return hit ? Number(hit.fixed) : 0;
      } catch (err) {
        return 0;
      }
    }

    // Iterate dispatches and build aggregates
    let totalSoldAmount = 0;
    let totalCommission = 0;
    let totalCashRemit = 0;

    for (const d of dispatches) {
      if (!d.return) continue; // only completed returns count

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
      };

      prev.soldAmount += soldAmount;
      prev.commission += comm;
      prev.cashRemit += cash;
      prev.grossSales = (prev.grossSales ?? 0) + gross;

      byWaiter.set(wid, prev);

      totalSoldAmount += soldAmount;
      totalCommission += comm;
      totalCashRemit += cash;
    }

    const results = Array.from(byWaiter.values()).map((r) => ({
      waiterId: r.waiterId,
      waiterName: r.waiterName,
      soldAmount: Number(r.soldAmount.toFixed(2)),
      commission: Number(r.commission.toFixed(2)),
      cashRemit: Number(r.cashRemit.toFixed(2)),
      grossSales: Number((r.grossSales ?? 0).toFixed(2)),
    }));

    return res.json({
      ok: true,
      date: start.toISOString().slice(0, 10),
      ...(waiterId ? { waiterId: Number(waiterId) } : {}),
      totals: {
        soldAmount: Number(totalSoldAmount.toFixed(2)),
        commission: Number(totalCommission.toFixed(2)),
        cashRemit: Number(totalCashRemit.toFixed(2)),
      },
      results,
    });
  } catch (err: any) {
    console.error("field-commission:daily error", err);
    return res.status(500).json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
