import { Router, type Request, type Response } from "express";
import prisma from "../lib/prisma.js"; // ✅ use shared HMR-safe Prisma client

import { validateBody } from "../utils/validate.js";
import { zStockMovementCreate } from "../schemas/index.js";
import { withItemLock, getStockOnHand } from "../services/inventory.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

// Local runtime type for direction (matches your intent)
// (You can switch to `import type { MovementDirection } from "@prisma/client"`
//  after running `prisma generate` if your schema defines the enum.)
type MovementDirection = "IN" | "OUT";

const r = Router();

/* ----------------------- Helpers ----------------------- */

function toInt(v: unknown, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getPageParams(q: Record<string, unknown>) {
  const page = Math.max(1, toInt(q.page ?? 1, 1));
  const rawLimit = (q as any).limit ?? (q as any).pageSize ?? 20;
  const limit = Math.min(100, Math.max(1, toInt(rawLimit, 20)));
  const skip = (page - 1) * limit;
  const take = limit;
  return { page, limit, skip, take };
}

function pageMeta(total: number, page: number, limit: number) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return { total, page, limit, pages, hasNext: page < pages, hasPrev: page > 1 };
}

const SORT_WHITELIST = new Set(["createdAt", "id", "quantity", "unitCost"] as const);
function getSortParams(q: Record<string, unknown>) {
  const sortRaw = String((q as any).sort ?? "createdAt");
  const sort = SORT_WHITELIST.has(sortRaw as any)
    ? (sortRaw as "createdAt" | "id" | "quantity" | "unitCost")
    : "createdAt";
  const orderRaw = String((q as any).order ?? "desc").toLowerCase();
  const order: "asc" | "desc" = orderRaw === "asc" ? "asc" : "desc";
  return { sort, order };
}

function getFilters(q: Record<string, unknown>) {
  const itemIdVal = (q as any).itemId ?? undefined;
  const itemId = itemIdVal !== undefined ? Number(itemIdVal) : undefined;

  const directionRaw = (q as any).direction
    ? String((q as any).direction).toUpperCase()
    : undefined;
  const direction =
    directionRaw === "IN" || directionRaw === "OUT" ? directionRaw : undefined;

  const where: Record<string, unknown> = {};
  if (itemId !== undefined && !Number.isNaN(itemId)) where.itemId = itemId;
  if (direction) where.direction = direction as MovementDirection;

  return { where };
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/* ------------------------ Routes ----------------------- */

/** GET /api/stock-movements */
r.get("/", async (req: Request, res: Response) => {
  const { where } = getFilters(req.query as Record<string, unknown>);
  const { sort, order } = getSortParams(req.query as Record<string, unknown>);
  const { page, limit, skip, take } = getPageParams(req.query as Record<string, unknown>);

  try {
    const [rows, total] = await Promise.all([
      prisma.stockMovement.findMany({ where, orderBy: { [sort]: order }, skip, take }),
      prisma.stockMovement.count({ where }),
    ]);

    const data = rows.map((m: any) => ({
      id: m.id,
      itemId: m.itemId,
      direction: m.direction,
      quantity: Number(m.quantity),
      unitCost: m.unitCost != null ? String(m.unitCost) : null,
      note: m.note,
      createdAt: m.createdAt,
    }));

    return res.json({ data, meta: pageMeta(total, page, limit) });
  } catch (e: unknown) {
    console.error("GET /stock-movements error", e);
    return res
      .status(500)
      .json({ error: "failed_to_fetch_stock_movements", detail: errMsg(e) });
  }
});

/** POST /api/stock-movements */
r.post(
  "/",
  requireAuth,
  requireAdmin,
  writeLimiter,
  validateBody(zStockMovementCreate),
  async (req: Request, res: Response) => {
    const { itemId, direction, quantity, unitCost = null, note = null } = req.body as {
      itemId: number | string;
      direction: MovementDirection;
      quantity: number;
      unitCost?: number | null;
      note?: string | null;
    };

    if (direction === "OUT") {
      try {
        const created = await withItemLock(prisma, Number(itemId), async (tx: any) => {
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
            data: { itemId: Number(itemId), direction, quantity, unitCost, note },
          });
        });

        if ((created as any)?.json) return; // already responded (409 case)
        return res.status(201).json({
          ...created,
          quantity: Number((created as any).quantity),
          unitCost:
            (created as any).unitCost != null ? String((created as any).unitCost) : null,
        });
      } catch (e: unknown) {
        return res
          .status(500)
          .json({ error: "failed_to_create_stock_movement", detail: errMsg(e) });
      }
    }

    // IN path
    try {
      const row = await prisma.stockMovement.create({
        data: { itemId: Number(itemId), direction, quantity, unitCost, note },
      });
      return res.status(201).json({
        ...row,
        quantity: Number((row as any).quantity),
        unitCost: (row as any).unitCost != null ? String((row as any).unitCost) : null,
      });
    } catch (e: unknown) {
      return res
        .status(500)
        .json({ error: "failed_to_create_stock_movement", detail: errMsg(e) });
    }
  }
);

export default r;
