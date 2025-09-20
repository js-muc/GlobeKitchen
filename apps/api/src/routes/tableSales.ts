import { Router } from "express";
import { PrismaClient, TableCode } from "@prisma/client";
import { validateBody } from "../utils/validate";
import { zTableSaleCreate } from "../schemas";
import { withItemLock, getStockOnHand } from "../services/inventory";
import { writeLimiter } from "../middlewares/rateLimit";

const prisma = new PrismaClient();
const r = Router();

// Local helpers (keep file self-contained; same pattern as other routes)
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
 * GET /api/table-sales
 * Optional filters:
 *   ?waiterId=1
 *   ?tableCode=A6
 * Optional pagination:
 *   ?page=1&pageSize=20
 * Behavior:
 *   - If no page/pageSize → returns plain array (original style)
 *   - If page/pageSize present → returns { data, meta }
 */
r.get("/", async (req, res) => {
  const waiterId = req.query.waiterId ? Number(req.query.waiterId) : undefined;
  const tableCode = (req.query.tableCode as string) || undefined;

  const where: any = {};
  if (waiterId) where.waiterId = waiterId;
  if (tableCode) where.tableCode = tableCode as TableCode;

  const { hasPaging, page, pageSize, skip, take } = getPageParams(req.query);

  if (!hasPaging) {
    // Original behavior (preserved): return full array when no pagination params
    const rows = await prisma.tableSale.findMany({
      where,
      orderBy: { id: "desc" },
    });
    return res.json(rows);
  }

  // Paginated response
  const [rows, total] = await Promise.all([
    prisma.tableSale.findMany({ where, orderBy: { id: "desc" }, skip, take }),
    prisma.tableSale.count({ where }),
  ]);
  return res.json({ data: rows, meta: pageMeta(total, page, pageSize) });
});

/** POST /api/table-sales */
r.post("/", writeLimiter, validateBody(zTableSaleCreate), async (req, res) => {
  const { date, waiterId, tableCode, itemId, qty, priceEach, discount = 0, lossQty = 0, note = null } = req.body;

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
    if ((created as any)?.json) return; // res already sent
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(500).json({ error: "failed_to_create_table_sale", detail: e?.message });
  }
});

export default r;
