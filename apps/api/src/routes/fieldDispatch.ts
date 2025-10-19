// apps/api/src/routes/fieldDispatch.ts
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate.js";
import { zFieldDispatchCreate } from "../schemas/index.js";
import { withItemLock, getStockOnHand } from "../services/inventory.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const prisma = new PrismaClient();
const r = Router();

/* ----------------------- Helpers ----------------------- */
// Keep file self-contained (same pattern as other routes)
function toInt(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getPageParams(q: any) {
  // Preserve original behavior: only paginate if page or pageSize/limit provided
  const hasPaging = q.page !== undefined || q.pageSize !== undefined || q.limit !== undefined;

  const page = Math.max(1, toInt(q.page ?? 1, 1));
  const rawLimit = q.limit ?? q.pageSize ?? 20; // accept alias in INPUT
  const limit = Math.min(100, Math.max(1, toInt(rawLimit, 20)));

  const skip = (page - 1) * limit;
  const take = limit;

  return { hasPaging, page, limit, skip, take };
}

function pageMeta(total: number, page: number, limit: number) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return {
    total,
    page,
    limit, // normalized (no pageSize in meta)
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}

/** Robust money → string serializer (Decimal | number | string | null | undefined) */
function moneyToString(v: any): string | null {
  if (v === null || v === undefined) return null;
  // Prisma Decimal has toString(); numbers/strings are fine
  try {
    return String(v);
  } catch {
    // Fallback: best-effort
    return v != null ? `${v}` : null;
  }
}

function serializeDispatch(row: any) {
  return {
    id: row.id,
    date: row.date,
    waiterId: row.waiterId,
    itemId: row.itemId,
    qtyDispatched: Number(row.qtyDispatched),
    priceEach: moneyToString((row as any).priceEach), // <- always string or null
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ------------------------ Routes ----------------------- */
/**
 * GET /api/field-dispatch
 * Filters: ?waiterId=&itemId=
 * Pagination: ?page=&limit=  (pageSize alias accepted)
 * Behavior:
 *  - No paging params -> plain array (original behavior)
 *  - With paging params -> { data, meta }
 */
r.get("/", async (req, res) => {
  const waiterId = req.query.waiterId ? Number(req.query.waiterId) : undefined;
  const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;

  const where: any = {};
  if (!Number.isNaN(waiterId) && waiterId !== undefined) where.waiterId = waiterId;
  if (!Number.isNaN(itemId) && itemId !== undefined) where.itemId = itemId;

  const { hasPaging, page, limit, skip, take } = getPageParams(req.query);

  try {
    if (!hasPaging) {
      // ✅ Original behavior: return full array when no pagination params
      const rows = await prisma.fieldDispatch.findMany({
        where,
        orderBy: { id: "desc" },
      });
      return res.json(rows.map(serializeDispatch));
    }

    // ✅ Paginated response
    const [rows, total] = await Promise.all([
      prisma.fieldDispatch.findMany({ where, orderBy: { id: "desc" }, skip, take }),
      prisma.fieldDispatch.count({ where }),
    ]);

    return res.json({
      data: rows.map(serializeDispatch),
      meta: pageMeta(total, page, limit),
    });
  } catch (e: any) {
    console.error("GET /field-dispatch error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_fetch_field_dispatch", detail: e?.message });
  }
});

/** POST /api/field-dispatch */
r.post(
  "/",
  requireAuth,
  requireAdmin,
  writeLimiter,
  validateBody(zFieldDispatchCreate),
  async (req, res) => {
    const { date, waiterId, itemId, qtyDispatched, priceEach } = req.body;

    try {
      const created = await withItemLock(prisma, Number(itemId), async (tx) => {
        const onHand = await getStockOnHand(tx, Number(itemId));
        if (onHand < qtyDispatched) {
          return res.status(409).json({
            error: "insufficient_stock",
            message: `Stock on hand ${onHand} is less than requested ${qtyDispatched} (dispatch)`,
            itemId: Number(itemId),
            stockOnHand: onHand,
            attemptedDecrease: qtyDispatched,
          });
        }
        return tx.fieldDispatch.create({
          data: {
            date: date ? new Date(date) : new Date(),
            waiterId: Number(waiterId),
            itemId: Number(itemId),
            qtyDispatched,
            priceEach,
          },
        });
      });

      if ((created as any)?.json) return; // response already sent inside tx
      return res.status(201).json(serializeDispatch(created));
    } catch (e: any) {
      console.error("POST /field-dispatch error:", e);
      return res
        .status(500)
        .json({ error: "failed_to_create_field_dispatch", detail: e?.message });
    }
  }
);

export default r;
// apps/api/src/routes/fieldDispatch.ts
export { serializeDispatch };
