// apps/api/src/routes/commissionPlans.ts
import { Router } from 'express';
import { PrismaClient, CommissionRole, WaiterType } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type Bracket = { min: number; max: number; fixed: number };

function parseBrackets(raw: any): Bracket[] {
  if (!raw) return [];
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    return (arr as any[])
      .map((b) => {
        // robust numeric parsing: remove commas/space then parse
        const normalize = (x: any) => {
          if (x == null) return NaN;
          const s = String(x).replace(/[, \u00A0]+/g, '').trim();
          return Number(s);
        };
        return {
          min: normalize((b as any)?.min),
          max: normalize((b as any)?.max),
          fixed: normalize((b as any)?.fixed),
        };
      })
      .filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max) && Number.isFinite(b.fixed))
      .sort((a, b) => a.min - b.min);
  } catch {
    return [];
  }
}

/**
 * Matching helper
 *
 * NOTE: We treat both min and max as inclusive boundaries here.
 * This avoids 1-unit holes (e.g. 4000 falling between [3501..4000] and [4001..4500]).
 */
function match(brs: Bracket[], v: number): Bracket | null {
  if (!brs || brs.length === 0) return null;
  for (let i = 0; i < brs.length; i++) {
    const b = brs[i];
    // BOTH bounds inclusive
    if (v >= b.min && v <= b.max) return b;
  }
  return null;
}

/**
 * Nairobi-safe day window:
 * - Convert the target date (or now) to a Nairobi YYYY-MM-DD string
 * - Build UTC start/end that bound that Nairobi business day
 */
function dayRange(dateISO?: string) {
  const tz = 'Africa/Nairobi';
  const base = dateISO ? new Date(dateISO) : new Date();

  // e.g. "2025-11-04" in Nairobi calendar
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);

  const [y, m, d] = ymd.split('-').map(Number);
  // UTC boundaries for that Nairobi day
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const next = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
  return { start, next, iso: ymd };
}

/* ------------------------------------------------------------------ */
/* INSIDE — existing endpoints                                         */
/* ------------------------------------------------------------------ */

/** GET /api/commission/inside/default */
router.get('/inside/default', async (_req, res) => {
  try {
    const plan = await prisma.commissionPlan.findFirst({
      where: { role: CommissionRole.INSIDE, isDefault: true },
    });
    if (!plan) return res.status(404).json({ error: 'No inside plan found' });
    res.json(plan);
  } catch (err) {
    console.error('Error fetching inside plan', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/commission/inside/today/:employeeId
 * Accepts optional query param ?dateISO=YYYY-MM-DD to preview other days.
 */
router.get('/inside/today/:employeeId', async (req, res) => {
  try {
    const employeeIdNum = Number(req.params.employeeId);
    if (!Number.isFinite(employeeIdNum)) {
      return res.status(400).json({ error: 'Invalid employeeId' });
    }

    const dateISO = typeof req.query.dateISO === 'string' && req.query.dateISO.trim() ? String(req.query.dateISO) : undefined;
    const { start, next, iso } = dayRange(dateISO);

    const shift = await prisma.shift.findFirst({
      where: {
        employeeId: employeeIdNum,
        waiterType: WaiterType.INSIDE,
        date: { gte: start, lt: next },
      },
      select: { id: true, netSales: true },
    });

    const dailySales = shift?.netSales ? Number(shift.netSales) : 0;

    // prefer employee-specific plan
    const employee = await prisma.employee.findUnique({
      where: { id: employeeIdNum },
      select: { commissionPlanId: true },
    });

    const plan =
      employee?.commissionPlanId
        ? await prisma.commissionPlan.findUnique({ where: { id: employee.commissionPlanId } })
        : await prisma.commissionPlan.findFirst({ where: { role: CommissionRole.INSIDE, isDefault: true } });

    if (!plan) return res.json({ shiftId: shift?.id ?? null, dailySales, commission: 0, nextTarget: null });

    const brackets = parseBrackets(plan.bracketsJson);
    const hit = match(brackets, dailySales);

    let nextTarget: null | { target: number; earns: number } = null;
    for (const b of brackets) {
      if (dailySales < b.min) {
        nextTarget = { target: b.min, earns: b.fixed };
        break;
      }
    }

    res.json({
      shiftId: shift?.id ?? null,
      dateISO: iso,
      dailySales,
      commission: hit ? hit.fixed : 0,
      nextTarget,
    });
  } catch (err) {
    console.error('Commission preview error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/** POST /api/commission/inside/apply/:shiftId */
router.post('/inside/apply/:shiftId', async (req, res) => {
  try {
    const shiftIdNum = Number(req.params.shiftId);
    if (!Number.isFinite(shiftIdNum)) {
      return res.status(400).json({ error: 'Invalid shiftId' });
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftIdNum },
      select: {
        id: true,
        date: true,
        waiterType: true,
        netSales: true,
        employeeId: true,
        cashup: { select: { id: true, snapshot: true } },
      },
    });

    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    if (shift.waiterType !== WaiterType.INSIDE) {
      return res.status(400).json({ error: 'Shift is not INSIDE' });
    }

    const dailySales = shift.netSales ? Number(shift.netSales) : 0;

    const employee = await prisma.employee.findUnique({
      where: { id: shift.employeeId },
      select: { commissionPlanId: true },
    });

    const plan =
      employee?.commissionPlanId
        ? await prisma.commissionPlan.findUnique({ where: { id: employee.commissionPlanId } })
        : await prisma.commissionPlan.findFirst({ where: { role: CommissionRole.INSIDE, isDefault: true } });

    if (!plan) return res.status(400).json({ error: 'No commission plan configured' });

    // debug logging to help trace why a bracket may not match
    console.info('INSIDE apply - plan id:', plan.id, 'employeeId:', shift.employeeId);
    console.info('INSIDE apply - raw bracketsJson:', String(plan.bracketsJson).slice(0, 1000));

    const brackets = parseBrackets(plan.bracketsJson);
    // use unified matching helper
    const hit = match(brackets, dailySales);

    let amount = 0;
    let bracketMin: number | null = null;
    let bracketMax: number | null = null;

    if (hit) {
      amount = hit.fixed;
      bracketMin = hit.min;
      bracketMax = hit.max;
    } else {
      // no hit -> amount stays 0
    }

    const commissionPayload = {
      role: 'INSIDE',
      planId: plan.id,
      dailySales,
      amount,
      bracketMin,
      bracketMax,
      computedAt: new Date().toISOString(),
    };

    console.info('INSIDE apply - computed', { shiftId: shift.id, dailySales, amount, bracketMin, bracketMax });

    if (shift.cashup?.id) {
      const prev = (shift.cashup.snapshot ?? {}) as Record<string, any>;
      const next = { ...prev, commission: commissionPayload };
      await prisma.shiftCashup.update({ where: { id: shift.cashup.id }, data: { snapshot: next } });
    } else {
      await prisma.shiftCashup.create({
        data: { shiftId: shift.id, snapshot: { commission: commissionPayload } },
      });
    }

    return res.json({
      shiftId: shift.id,
      dailySales,
      applied: { amount, bracketMin, bracketMax },
    });
  } catch (err) {
    console.error('Commission apply error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ------------------------------------------------------------------ */
/* FIELD — endpoints (fixed for business-day & timezone)               */
/* ------------------------------------------------------------------ */

/** GET /api/commission/field/default */
router.get('/field/default', async (_req, res) => {
  try {
    const plan = await prisma.commissionPlan.findFirst({
      where: { role: CommissionRole.FIELD, isDefault: true },
    });
    if (!plan) return res.status(404).json({ error: 'No field plan found' });
    res.json(plan);
  } catch (err) {
    console.error('Error fetching field plan', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/commission/field/today/:employeeId — live preview
 * Uses the DISPATCH business date (fd.date) within the Nairobi day window.
 * Accepts optional ?dateISO=YYYY-MM-DD to preview another day.
 */
router.get('/field/today/:employeeId', async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!Number.isFinite(employeeId)) return res.status(400).json({ error: 'Invalid employeeId' });

    const dateISO = typeof req.query.dateISO === 'string' && req.query.dateISO.trim() ? String(req.query.dateISO) : undefined;
    const { start, next, iso } = dayRange(dateISO);

    // Sum cashCollected for that waiter today via FieldReturn ← FieldDispatch(waiterId) using dispatch date window
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        COALESCE(SUM(fr."cashCollected"), 0) AS cash
      FROM "FieldReturn" fr
      JOIN "FieldDispatch" fd ON fd.id = fr."dispatchId"
      WHERE fd."date" >= $1 AND fd."date" < $2
        AND fd."waiterId" = $3
      `,
      start, next, employeeId
    );
    const cashCollected = Number(rows?.[0]?.cash ?? 0);

    // Get plan (employee-specific else default FIELD)
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { commissionPlanId: true },
    });
    const plan =
      employee?.commissionPlanId
        ? await prisma.commissionPlan.findUnique({ where: { id: employee.commissionPlanId } })
        : await prisma.commissionPlan.findFirst({ where: { role: CommissionRole.FIELD, isDefault: true } });

    const brackets = parseBrackets(plan?.bracketsJson);
    const hit = match(brackets, cashCollected);

    let nextTarget: null | { target: number; earns: number } = null;
    for (const b of brackets) { if (cashCollected < b.min) { nextTarget = { target: b.min, earns: b.fixed }; break; } }

    return res.json({
      dateISO: iso,
      waiterId: employeeId,
      cashCollected,
      commission: hit ? hit.fixed : 0,
      nextTarget,
    });
  } catch (err) {
    console.error('field today preview error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/commission/field/apply
 * Body: { waiterId: number, dateISO?: 'YYYY-MM-DD' }
 * - Computes the day's cashCollected using DISPATCH date (fd.date)
 * - Finds or creates a FIELD Shift for that date
 * - Upserts ShiftCashup.snapshot.commission = { role:'FIELD', ... }
 */
router.post('/field/apply', async (req, res) => {
  try {
    const waiterId = Number(req.body?.waiterId);
    const dateISO: string | undefined = req.body?.dateISO;
    if (!Number.isFinite(waiterId)) return res.status(400).json({ error: 'Invalid waiterId' });

    const { start, next, iso } = dayRange(dateISO);

    // compute cash by dispatch business day
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT COALESCE(SUM(fr."cashCollected"), 0) AS cash
      FROM "FieldDispatch" fd
      LEFT JOIN "FieldReturn" fr ON fr."dispatchId" = fd.id
      WHERE fd."date" >= $1 AND fd."date" < $2
        AND fd."waiterId" = $3
      `,
      start, next, waiterId
    );
    const cashCollected = Number(rows?.[0]?.cash ?? 0);

    // plan
    const employee = await prisma.employee.findUnique({
      where: { id: waiterId },
      select: { commissionPlanId: true },
    });
    const plan =
      employee?.commissionPlanId
        ? await prisma.commissionPlan.findUnique({ where: { id: employee.commissionPlanId } })
        : await prisma.commissionPlan.findFirst({ where: { role: CommissionRole.FIELD, isDefault: true } });

    if (!plan) return res.status(400).json({ error: 'No FIELD plan configured' });

    // debug info
    console.info('FIELD apply - plan id:', plan.id, 'waiterId:', waiterId);
    console.info('FIELD apply - raw bracketsJson:', String(plan.bracketsJson).slice(0, 1000));

    const brackets = parseBrackets(plan.bracketsJson);
    const hit = match(brackets, cashCollected);
    const amount = hit ? hit.fixed : 0;
    const bracketMin = hit?.min ?? null;
    const bracketMax = hit?.max ?? null;

    type ShiftForCashup = { id: number; cashup: { id: number; snapshot: any } | null };

    // find/create Shift for that waiter/date (FIELD)
    let shift: ShiftForCashup | null = await prisma.shift.findFirst({
      where: { employeeId: waiterId, waiterType: WaiterType.FIELD, date: { gte: start, lt: next } },
      select: { id: true, cashup: { select: { id: true, snapshot: true } } },
    });

    if (!shift) {
      shift = await prisma.shift.create({
        data: { employeeId: waiterId, waiterType: WaiterType.FIELD, date: start, openedAt: start },
        select: { id: true, cashup: { select: { id: true, snapshot: true } } },
      });
    }
    if (!shift) throw new Error('Shift creation failed');

    // upsert ShiftCashup.snapshot
    const payload = {
      role: 'FIELD',
      planId: plan.id,
      dateISO: iso,
      cashCollected,
      amount,
      bracketMin,
      bracketMax,
      computedAt: new Date().toISOString(),
    };

    // debug apply info
    console.info('FIELD apply - computed', { shiftId: shift.id, cashCollected, amount, bracketMin, bracketMax });

    if (shift.cashup?.id) {
      const prev = (shift.cashup.snapshot ?? {}) as Record<string, any>;
      const nextSnap = { ...prev, commission: payload };
      await prisma.shiftCashup.update({ where: { id: shift.cashup.id }, data: { snapshot: nextSnap } });
    } else {
      await prisma.shiftCashup.create({ data: { shiftId: shift.id, snapshot: { commission: payload } } });
    }

    return res.json({
      shiftId: shift.id,
      dateISO: iso,
      waiterId,
      cashCollected,
      applied: { amount, bracketMin, bracketMax },
    });
  } catch (err) {
    console.error('field apply error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
