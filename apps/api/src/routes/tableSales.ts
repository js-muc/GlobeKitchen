// apps/api/src/routes/tableSales.ts
import { Router } from "express";
import { PrismaClient, TableCode } from "@prisma/client";
import { validateBody } from "../utils/validate.js";
import { zTableSaleCreate } from "../schemas/index.js";
import { withItemLock, getStockOnHand } from "../services/inventory.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const prisma = new PrismaClient();
const r = Router();

/* ----------------------- Helpers ----------------------- */
// Keep file self-contained; same pattern as other routes
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

function serializeSale(row: any) {
  return {
    id: row.id,
    date: row.date,
    waiterId: row.waiterId,
    tableCode: row.tableCode as TableCode,
    itemId: row.itemId,
    qty: Number(row.qty),
    priceEach: row.priceEach != null ? String(row.priceEach) : null,
    discount: row.discount != null ? Number(row.discount) : 0,
    lossQty: row.lossQty != null ? Number(row.lossQty) : 0,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ------------------------ Routes ----------------------- */
/**
 * GET /api/table-sales
 * Optional filters: ?waiterId=1  ?tableCode=A6
 * Optional pagination: ?page=1&limit=20  (pageSize alias accepted)
 * Behavior:
 *  - No paging params → returns plain array (original style)
 *  - Paging params present → returns { data, meta }
 */
r.get("/", async (req, res) => {
  const waiterId = req.query.waiterId ? Number(req.query.waiterId) : undefined;
  const tableCode = (req.query.tableCode as string) || undefined;

  const where: any = {};
  if (!Number.isNaN(waiterId) && waiterId !== undefined) where.waiterId = waiterId;
  if (tableCode) where.tableCode = tableCode as TableCode;

  const { hasPaging, page, limit, skip, take } = getPageParams(req.query);

  try {
    if (!hasPaging) {
      // ✅ Original behavior: full array when no pagination params
      const rows = await prisma.tableSale.findMany({
        where,
        orderBy: { id: "desc" },
      });
      return res.json(rows.map(serializeSale));
    }

    // ✅ Paginated response
    const [rows, total] = await Promise.all([
      prisma.tableSale.findMany({ where, orderBy: { id: "desc" }, skip, take }),
      prisma.tableSale.count({ where }),
    ]);

    return res.json({
      data: rows.map(serializeSale),
      meta: pageMeta(total, page, limit),
    });
  } catch (e: any) {
    console.error("GET /table-sales error:", e);
    return res.status(500).json({ error: "failed_to_fetch_table_sales", detail: e?.message });
  }
});

/** POST /api/table-sales */
r.post(
  "/",
  requireAuth,
  requireAdmin,
  writeLimiter,
  validateBody(zTableSaleCreate),
  async (req, res) => {
    const {
      date,
      waiterId,
      tableCode,
      itemId,
      qty,
      priceEach,
      discount = 0,
      lossQty = 0,
      note = null,
    } = req.body;

    const decreaseBy = Number(qty) + Number(lossQty || 0);

    try {
      const created = await withItemLock(prisma, Number(itemId), async (tx) => {
        const onHand = await getStockOnHand(tx, Number(itemId));
        if (onHand < decreaseBy) {
          return res.status(409).json({
            error: "insufficient_stock",
            message: `Stock on hand ${onHand} is less than required ${decreaseBy} (qty + lossQty)`,
            itemId: Number(itemId),
            stockOnHand: onHand,
            attemptedDecrease: decreaseBy,
          });
        }
        return tx.tableSale.create({
          data: {
            date: date ? new Date(date) : new Date(),
            waiterId: Number(waiterId),
            tableCode: tableCode as TableCode,
            itemId: Number(itemId),
            qty,
            priceEach,
            discount,
            lossQty,
            note,
          },
        });
      });

      if ((created as any)?.json) return; // response already sent inside lock path
      return res.status(201).json(serializeSale(created));
    } catch (e: any) {
      console.error("POST /table-sales error:", e);
      return res
        .status(500)
        .json({ error: "failed_to_create_table_sale", detail: e?.message });
    }
  }
);

export default r;
