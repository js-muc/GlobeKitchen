// apps/api/src/routes/fieldDispatch.ts
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate.js";
import { z } from "zod";
import { zFieldDispatchCreate } from "../schemas/index.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const prisma = new PrismaClient();
const r = Router();

/* ---------------- helpers ---------------- */
function moneyToString(v: any): string | null {
  if (v == null) return null;
  try { return String(v); } catch { return `${v}`; }
}
function serializeDispatch(row: any) {
  return {
    id: row.id,
    date: row.date,
    waiterId: row.waiterId,
    itemId: row.itemId,
    qtyDispatched: Number(row.qtyDispatched),
    priceEach: moneyToString(row.priceEach),
    createdAt: row.createdAt,
    itemName: row.item?.name ?? row.itemName ?? undefined,
    returned: !!row.return,
  };
}

/** Build an inclusive day range [start, end) in UTC from a YYYY-MM-DD (or “today”). */
function buildDayRange(params: { day?: string; dateISO?: string }) {
  const isToday = (params.day || "").toLowerCase() === "today";
  const iso = params.dateISO && /^\d{4}-\d{2}-\d{2}$/.test(params.dateISO) ? params.dateISO : null;

  const base = iso ? new Date(`${iso}T00:00:00.000Z`) : new Date();
  // Use UTC to avoid TZ drift across servers
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1, 0, 0, 0, 0));

  return { hasDayFilter: isToday || !!iso, start, end };
}

/* ---------------- list: supports ?waiterId, ?itemId, ?day=today, ?date=YYYY-MM-DD ---------------- */
r.get("/", async (req, res) => {
  try {
    const waiterId = req.query.waiterId ? Number(req.query.waiterId) : undefined;
    const itemId   = req.query.itemId   ? Number(req.query.itemId)   : undefined;
    const day      = String(req.query.day || "");
    const dateISO  = String(req.query.date || "");

    const { hasDayFilter, start, end } = buildDayRange({ day, dateISO });

    const where: any = {};
    if (Number.isFinite(waiterId)) where.waiterId = waiterId as number;
    if (Number.isFinite(itemId))   where.itemId   = itemId   as number;
    if (hasDayFilter) where.date = { gte: start, lt: end };

    const rows = await prisma.fieldDispatch.findMany({
      where,
      orderBy: hasDayFilter ? { id: "asc" } : { id: "desc" },
      select: {
        id: true, date: true, waiterId: true, itemId: true,
        qtyDispatched: true, priceEach: true, createdAt: true,
        item: { select: { name: true } },
        return: { select: { id: true } },
      },
    });

    return res.json(rows.map(serializeDispatch));
  } catch (e: any) {
    console.error("GET /field-dispatch error:", e);
    return res.status(500).json({ error: "failed_to_fetch_field_dispatch", detail: e?.message });
  }
});

/* ---------------- explicit /today (same logic; supports ?waiterId, ?date=YYYY-MM-DD) ---------------- */
r.get("/today", async (req, res) => {
  try {
    const waiterId = req.query.waiterId ? Number(req.query.waiterId) : undefined;
    const dateISO  = String(req.query.date || "");
    const { start, end } = buildDayRange({ day: "today", dateISO });

    const where: any = { date: { gte: start, lt: end } };
    if (Number.isFinite(waiterId)) where.waiterId = waiterId as number;

    const rows = await prisma.fieldDispatch.findMany({
      where,
      orderBy: { id: "asc" },
      select: {
        id: true, date: true, waiterId: true, itemId: true,
        qtyDispatched: true, priceEach: true, createdAt: true,
        item: { select: { name: true } },
        return: { select: { id: true } },
      },
    });

    return res.json(rows.map(serializeDispatch));
  } catch (e: any) {
    console.error("GET /field-dispatch/today error:", e);
    return res.status(500).json({ error: "failed_to_fetch_today_dispatch", detail: e?.message });
  }
});

/* ---------------- create dispatch (decoupled from inventory) ---------------- */
r.post(
  "/",
  requireAuth, requireAdmin, writeLimiter,
  validateBody(zFieldDispatchCreate),
  async (req, res) => {
    const { date, waiterId, itemId, qtyDispatched, priceEach } = req.body;
    try {
      const created = await prisma.fieldDispatch.create({
        data: {
          date: date ? new Date(date) : new Date(),
          waiterId: Number(waiterId),
          itemId: Number(itemId),
          qtyDispatched,
          priceEach,
        },
      });
      return res.status(201).json(serializeDispatch(created));
    } catch (e: any) {
      console.error("POST /field-dispatch error:", e);
      return res.status(500).json({ error: "failed_to_create_field_dispatch", detail: e?.message });
    }
  }
);

/* ---------------- create return ---------------- */
const zReturnCreate = z.object({
  cashCollected: z.number().nonnegative(),
  qtyReturned:   z.number().nonnegative().optional().default(0),
  lossQty:       z.number().nonnegative().optional().default(0),
  note:          z.string().nullable().optional(),
});

r.post(
  "/:id/return",
  requireAuth, requireAdmin, writeLimiter,
  validateBody(zReturnCreate),
  async (req, res) => {
    const dispatchId = Number(req.params.id);
    const { cashCollected, qtyReturned = 0, lossQty = 0, note = null } = req.body;

    try {
      const dispatch = await prisma.fieldDispatch.findUnique({ where: { id: dispatchId } });
      if (!dispatch) return res.status(404).json({ error: "dispatch_not_found" });

      const created = await prisma.fieldReturn.create({
        data: { dispatchId, qtyReturned, lossQty, cashCollected, note },
      });

      return res.status(201).json({
        id: created.id,
        dispatchId,
        qtyReturned: Number(created.qtyReturned),
        lossQty: Number(created.lossQty),
        cashCollected: Number(created.cashCollected),
        note: created.note ?? null,
        createdAt: created.createdAt,
      });
    } catch (e: any) {
      if (String(e?.code) === "P2002") {
        return res.status(409).json({ error: "return_already_exists", message: "This dispatch already has a return." });
      }
      console.error("POST /field-dispatch/:id/return error:", e);
      return res.status(500).json({ error: "failed_to_create_field_return", detail: e?.message });
    }
  }
);

export default r;
export { serializeDispatch };
