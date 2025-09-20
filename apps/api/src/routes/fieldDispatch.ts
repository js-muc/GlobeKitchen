import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate";
import { zFieldDispatchCreate } from "../schemas";
import { withItemLock, getStockOnHand } from "../services/inventory";
import { writeLimiter } from "../middlewares/rateLimit";

const prisma = new PrismaClient();
const r = Router();

// --- helpers for pagination (same pattern as other routes) ---
function getPageParams(q: any) {
  const hasPaging = q.page !== undefined || q.pageSize !== undefined;
  const page = Math.max(1, Number(q.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
  const skip = (page - 1) * pageSize;
  const take = pageSize;
  return { hasPaging, page, pageSize, skip, take };
}
function pageMeta(total: number, page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return { total, page, pageSize, pages, hasNext: page < pages, hasPrev: page > 1 };
}

/**
 * GET /api/field-dispatch
 * Filters: ?waiterId=&itemId=
 * Pagination: ?page=&pageSize=
 * Behavior:
 *  - No page/pageSize -> plain array (original behavior)
 *  - With page/pageSize -> { data, meta }
 */
r.get("/", async (req, res) => {
  const waiterId = req.query.waiterId ? Number(req.query.waiterId) : undefined;
  const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;

  const where: any = {};
  if (waiterId) where.waiterId = waiterId;
  if (itemId) where.itemId = itemId;

  const { hasPaging, page, pageSize, skip, take } = getPageParams(req.query);

  if (!hasPaging) {
    const rows = await prisma.fieldDispatch.findMany({
      where,
      orderBy: { id: "desc" },
    });
    return res.json(rows);
  }

  const [rows, total] = await Promise.all([
    prisma.fieldDispatch.findMany({ where, orderBy: { id: "desc" }, skip, take }),
    prisma.fieldDispatch.count({ where }),
  ]);
  return res.json({ data: rows, meta: pageMeta(total, page, pageSize) });
});

/** POST /api/field-dispatch */
r.post("/", writeLimiter, validateBody(zFieldDispatchCreate), async (req, res) => {
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
    if ((created as any)?.json) return; // responded inside tx
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(500).json({ error: "failed_to_create_field_dispatch", detail: e?.message });
  }
});

export default r;
