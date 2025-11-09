// apps/api/src/routes/fieldReturn.ts
import { Router } from "express";
import { PrismaClient, WaiterType } from "@prisma/client";
import { validateBody } from "../utils/validate.js";
import { zFieldReturnCreate } from "../schemas/index.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { z } from "zod";
import { computeFieldCommission } from "../services/commission.js";

const prisma = new PrismaClient();
const r = Router();

/* ----------------------- Helpers ----------------------- */
function toInt(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getPageParams(q: any) {
  const hasPaging = q.page !== undefined || q.pageSize !== undefined || q.limit !== undefined;
  const page = Math.max(1, toInt(q.page ?? 1, 1));
  const rawLimit = q.limit ?? q.pageSize ?? 20;
  const limit = Math.min(100, Math.max(1, toInt(rawLimit, 20)));
  const skip = (page - 1) * limit;
  const take = limit;
  return { hasPaging, page, limit, skip, take };
}

function pageMeta(total: number, page: number, limit: number) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return { total, page, limit, pages, hasNext: page < pages, hasPrev: page > 1 };
}

function moneyToString(v: any): string | null {
  if (v === null || v === undefined) return null;
  try { return String(v); } catch { return v != null ? `${v}` : null; }
}

function serializeReturn(row: any) {
  return {
    id: row.id,
    dispatchId: row.dispatchId,
    qtyReturned: Number(row.qtyReturned),
    lossQty: Number(row.lossQty ?? 0),
    cashCollected: moneyToString(row.cashCollected),
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  return d;
}

/* ------------------------ Original REST (kept) ----------------------- */
/** POST /api/field-return  (simple create by dispatchId) */
r.post(
  "/",
  requireAuth,
  requireAdmin,
  writeLimiter,
  validateBody(zFieldReturnCreate),
  async (req, res) => {
    const { dispatchId, qtyReturned, cashCollected = 0, note = null, lossQty = 0 } = req.body;

    try {
      const dispatch = await prisma.fieldDispatch.findUnique({ where: { id: Number(dispatchId) } });
      if (!dispatch) {
        return res.status(400).json({ error: "dispatch_not_found", message: "dispatchId does not exist" });
      }

      const totalReturned = Number(qtyReturned) + Number(lossQty || 0);
      if (totalReturned > Number(dispatch.qtyDispatched)) {
        return res.status(400).json({
          error: "return_exceeds_dispatch",
          message: `Returned (${qtyReturned}) + loss (${lossQty}) exceeds dispatched (${dispatch.qtyDispatched})`,
          dispatchId: dispatch.id,
          qtyDispatched: Number(dispatch.qtyDispatched),
          attemptedReturned: Number(qtyReturned),
          attemptedLoss: Number(lossQty),
        });
      }

      const row = await prisma.fieldReturn.create({
        data: {
          dispatchId: Number(dispatchId),
          qtyReturned: Number(qtyReturned),
          lossQty: Number(lossQty),
          cashCollected: Number(cashCollected),
          note,
        },
      });

      return res.status(201).json(serializeReturn(row));
    } catch (e: any) {
      if (e?.code === "P2002") {
        return res.status(409).json({ error: "duplicate_return", message: "Return already recorded for this dispatchId" });
      }
      if (e?.code === "P2003") {
        return res.status(400).json({ error: "dispatch_not_found", message: "dispatchId does not exist" });
      }
      return res.status(500).json({ error: "failed_to_create_field_return", detail: e?.message });
    }
  }
);

/**
 * GET /api/field-return
 * Filters: ?dispatchId=
 * Pagination: ?page=&limit=  (pageSize alias accepted)
 */
r.get("/", async (req, res) => {
  const dispatchId = req.query.dispatchId ? Number(req.query.dispatchId) : undefined;
  const where: any = {};
  if (!Number.isNaN(dispatchId) && dispatchId !== undefined) where.dispatchId = dispatchId;

  const { hasPaging, page, limit, skip, take } = getPageParams(req.query);

  try {
    if (!hasPaging) {
      const rows = await prisma.fieldReturn.findMany({ where, orderBy: { id: "desc" } });
      return res.json(rows.map(serializeReturn));
    }
    const [rows, total] = await Promise.all([
      prisma.fieldReturn.findMany({ where, orderBy: { id: "desc" }, skip, take }),
      prisma.fieldReturn.count({ where }),
    ]);
    return res.json({ data: rows.map(serializeReturn), meta: pageMeta(total, page, limit) });
  } catch (e: any) {
    console.error("GET /field-return error:", e);
    return res.status(500).json({ error: "failed_to_fetch_field_returns", detail: e?.message });
  }
});

/* ------------------------ New: per-dispatch return + sales/commission ----------------------- */

// Body for /field-dispatch/:id/return
const zPerDispatchReturn = z.object({
  qtyReturned: z.number().nonnegative(),
  lossQty: z.number().nonnegative(),
  cashCollected: z.number().nonnegative(),
  note: z.string().nullable().optional(),
});

// POST /api/field-dispatch/:id/return
r.post(
  "/field-dispatch/:id/return",
  requireAuth,
  requireAdmin,
  writeLimiter,
  validateBody(zPerDispatchReturn),
  async (req, res) => {
    const dispatchId = Number(req.params.id);
    const { qtyReturned, lossQty, cashCollected, note } = req.body;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // A) Load dispatch (waiter, item, qty, price)
        const d = await tx.fieldDispatch.findUnique({
          where: { id: dispatchId },
          include: { item: true, waiter: true },
        });
        if (!d) return res.status(404).json({ error: "dispatch_not_found" });

        // Check uniqueness (one return per dispatch)
        const already = await tx.fieldReturn.findUnique({ where: { dispatchId } });
        if (already) return res.status(409).json({ error: "duplicate_return" });

        // Validate qty
        const totalReturned = Number(qtyReturned) + Number(lossQty || 0);
        if (totalReturned > Number(d.qtyDispatched)) {
          return res.status(400).json({
            error: "return_exceeds_dispatch",
            message: `Returned (${qtyReturned}) + loss (${lossQty}) exceeds dispatched (${d.qtyDispatched})`,
          });
        }

        // B) Create FieldReturn
        const createdReturn = await tx.fieldReturn.create({
          data: {
            dispatchId,
            qtyReturned: Number(qtyReturned),
            lossQty: Number(lossQty),
            cashCollected: Number(cashCollected),
            note: note ?? null,
          },
        });

        // C) Compute sales (sold = dispatched - returned - loss)
        const qtyDispatched = Number(d.qtyDispatched);
        const qtySold = Math.max(0, qtyDispatched - Number(qtyReturned) - Number(lossQty || 0));
        const unitPrice = Number(d.priceEach);
        const grossSales = qtySold * unitPrice;

        // D) Upsert today's FIELD shift for waiter
        const dateOnly = startOfDay(new Date(d.date ?? new Date()));
        let shift = await tx.shift.findFirst({
          where: { date: dateOnly, employeeId: d.waiterId, waiterType: WaiterType.FIELD },
        });
        if (!shift) {
          shift = await tx.shift.create({
            data: {
              date: dateOnly,
              employeeId: d.waiterId,
              waiterType: WaiterType.FIELD,
              openedAt: new Date(),
              grossSales: 0,
              netSales: 0,
            },
          });
        }

        // E) Commission for this line
        const { commission, ratePct } = await computeFieldCommission(prisma, d.waiterId, grossSales);

        // F) Persist SaleLine (captures sales + commission)
        await tx.saleLine.create({
          data: {
            shiftId: shift.id,
            date: dateOnly,
            itemId: d.itemId,
            qty: qtySold,
            unit: d.item?.unit ?? "unit",
            unitPrice,
            total: grossSales,
            commissionEarned: commission,
            commissionRate: ratePct,
            note: `Field sale dispatch #${d.id}`,
          },
        });

        // G) Update shift aggregates
        await tx.shift.update({
          where: { id: shift.id },
          data: {
            grossSales: { increment: grossSales },
            netSales: { increment: grossSales }, // no discounts modeled here
          },
        });

        return {
          ok: true,
          fieldReturn: createdReturn,
          sold: qtySold,
          sales: grossSales,
          commission,
          commissionRate: ratePct,
        };
      });

      if ((result as any)?.ok) return res.json(result);
      return; // early response already sent in tx
    } catch (e: any) {
      console.error("POST /field-dispatch/:id/return error:", e);
      return res.status(500).json({ error: "failed_to_save_return", detail: e?.message });
    }
  }
);

export default r;
