import { Router } from "express";
import { PrismaClient, MovementDirection } from "@prisma/client";
import { validateBody } from "../utils/validate";
import { zStockMovementCreate } from "../schemas";
import { withItemLock, getStockOnHand } from "../services/inventory";
import { writeLimiter } from "../middlewares/rateLimit";

const prisma = new PrismaClient();
const r = Router();

/* ----------------------- Helpers ----------------------- */

function toInt(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getPageParams(q: any) {
  // accept both pageSize and limit (alias); normalize to "limit"
  const page = Math.max(1, toInt(q.page ?? 1, 1));

  const rawLimit = q.limit ?? q.pageSize ?? 20;
  const limit = Math.min(100, Math.max(1, toInt(rawLimit, 20))); // cap to 100

  const skip = (page - 1) * limit;
  const take = limit;

  return { page, limit, skip, take };
}

function pageMeta(total: number, page: number, limit: number) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return {
    total,
    page,
    limit, // canonical
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}

const SORT_WHITELIST = new Set(["createdAt", "id", "quantity", "unitCost"]);
function getSortParams(q: any) {
  const sortRaw = String(q.sort ?? "createdAt");
  const sort = SORT_WHITELIST.has(sortRaw) ? sortRaw : "createdAt";
  const orderRaw = String(q.order ?? "desc").toLowerCase();
  const order: "asc" | "desc" = orderRaw === "asc" ? "asc" : "desc";
  return { sort, order };
}

function getFilters(q: any) {
  const itemId = q.itemId ? Number(q.itemId) : undefined;
  const directionRaw = (q.direction as string | undefined)?.toUpperCase();
  const direction =
    directionRaw === "IN" || directionRaw === "OUT" ? directionRaw : undefined;

  const where: any = {};
  if (!Number.isNaN(itemId) && itemId !== undefined) where.itemId = itemId;
  if (direction) where.direction = direction as MovementDirection;

  return { where };
}

/* ------------------------ Routes ----------------------- */

/**
 * GET /api/stock-movements
 * Query:
 *  - itemId?: number
 *  - direction?: IN|OUT
 *  - page?: number (default 1)
 *  - limit?: number (default 20, max 100)  // accepts pageSize as alias
 *  - sort?: createdAt|id|quantity|unitCost (default createdAt)
 *  - order?: asc|desc (default desc)
 * Response: { data: StockMovement[], meta: { total, page, limit, pages, hasNext, hasPrev } }
 */
r.get("/", async (req, res) => {
  const { where } = getFilters(req.query);
  const { sort, order } = getSortParams(req.query);
  const { page, limit, skip, take } = getPageParams(req.query);

  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { [sort]: order },
      skip,
      take,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return res.json({ data: rows, meta: pageMeta(total, page, limit) });
});

/**
 * POST /api/stock-movements
 * Body: { itemId:number, direction:"IN"|"OUT", quantity:number, unitCost?:Decimal, note?:string }
 */
r.post("/", writeLimiter, validateBody(zStockMovementCreate), async (req, res) => {
  const { itemId, direction, quantity, unitCost = null, note = null } = req.body;

  if (direction === "OUT") {
    // guarded decrease with lock + transaction
    try {
      const created = await withItemLock(prisma, Number(itemId), async (tx) => {
        const onHand = await getStockOnHand(tx, Number(itemId));
        if (onHand < quantity) {
          return res.status(409).json({
            error: "insufficient_stock",
            message: `Stock on hand ${onHand} is less than requested ${quantity}`,
            itemId: Number(itemId),
            stockOnHand: onHand,
            attemptedDecrease: quantity,
          });
        }
        return tx.stockMovement.create({
          data: {
            itemId: Number(itemId),
            direction: direction as MovementDirection,
            quantity,
            unitCost,
            note,
          },
        });
      });

      // early return if the transaction already sent a response
      if ((created as any)?.json) return;
      return res.status(201).json(created);
    } catch (e: any) {
      return res
        .status(500)
        .json({ error: "failed_to_create_stock_movement", detail: e?.message });
    }
  }

  // IN path — create directly
  try {
    const row = await prisma.stockMovement.create({
      data: {
        itemId: Number(itemId),
        direction: direction as MovementDirection,
        quantity,
        unitCost,
        note,
      },
    });
    return res.status(201).json(row);
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: "failed_to_create_stock_movement", detail: e?.message });
  }
});

export default r;
