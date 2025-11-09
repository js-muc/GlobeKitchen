import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate.js";
import { zItemCreate, zItemUpdate } from "../schemas/index.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

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
  const limit = Math.min(200, Math.max(1, toInt(rawLimit, 20))); // align with frontend limit <= 200
  const skip = (page - 1) * limit;
  const take = limit;
  return { hasPaging, page, limit, skip, take };
}

function pageMeta(total: number, page: number, limit: number) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return { total, page, limit, pages, hasNext: page < pages, hasPrev: page > 1 };
}

function serializeItem(row: any) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    priceSell: row.priceSell != null ? String(row.priceSell) : null,
    costUnit: row.costUnit != null ? String(row.costUnit) : null,
    active: !!row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* -------------------------- Routes -------------------------- */

// GET /api/items
r.get("/", async (req, res) => {
  const { hasPaging, page, limit, skip, take } = getPageParams(req.query);

  try {
    if (!hasPaging) {
      const rows = await prisma.menuItem.findMany({ orderBy: { name: "asc" } });
      return res.json(rows.map(serializeItem));
    }

    const [rows, total] = await Promise.all([
      prisma.menuItem.findMany({ orderBy: { name: "asc" }, skip, take }),
      prisma.menuItem.count(),
    ]);

    return res.json({
      data: rows.map(serializeItem),
      meta: pageMeta(total, page, limit),
    });
  } catch (e: any) {
    console.error("GET /items error:", e);
    return res.status(500).json({ error: "failed_to_fetch_items", detail: e?.message });
  }
});

/**
 * POST /api/items
 * requireAuth (so authenticated inventory users can create materials)
 * accepts optional startingQty which will create an initial IN movement in the same transaction
 */
r.post(
  "/",
  requireAuth,
  writeLimiter,
  validateBody(zItemCreate),
  async (req, res) => {
    try {
      const {
        name,
        priceSell = null,
        unit = "unit",
        category = "Materials",
        costUnit = null,
        active = true,
        startingQty,
      } = req.body as any;

      const result = await prisma.$transaction(async (tx) => {
        const row = await tx.menuItem.create({
          data: {
            name,
            priceSell,
            unit,
            category,
            costUnit,
            active,
          },
        });

        if (startingQty !== undefined && startingQty !== null && Number(startingQty) > 0) {
          await tx.stockMovement.create({
            data: {
              itemId: row.id,
              direction: "IN",
              quantity: Number(startingQty),
              unitCost: null,
              note: "Initial starting quantity",
            },
          });
        }

        return row;
      });

      return res.status(201).json(serializeItem(result));
    } catch (e: any) {
      console.error("POST /items error:", e);
      if (e?.code === "P2002") {
        // unique constraint (duplicate name) — return friendly error
        return res.status(400).json({ error: "duplicate_item", detail: e?.meta ?? e?.message });
      }
      return res.status(500).json({ error: "failed_to_create_item", detail: e?.message });
    }
  }
);

// PUT /api/items/:id (guarded)
r.put(
  "/:id",
  requireAuth,
  requireAdmin,
  writeLimiter,
  validateBody(zItemUpdate),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, priceSell, unit, category, costUnit, active } = req.body;

      const row = await prisma.menuItem.update({
        where: { id },
        data: { name, priceSell, unit, category, costUnit, active },
      });

      return res.json(serializeItem(row));
    } catch (e: any) {
      console.error("PUT /items/:id error:", e);
      if (e?.code === "P2025" || /Record to update does not exist/i.test(e?.message || "")) {
        return res.status(404).json({ error: "not_found" });
      }
      return res.status(500).json({ error: "failed_to_update_item", detail: e?.message });
    }
  }
);

/**
 * DELETE /api/items/:id
 * - Default: soft-delete (set active = false)
 * - If ?force=true is passed, attempt a hard delete by first deleting dependent stock movements in a transaction.
 *   This avoids foreign-key constraint failures when movements referencing the item exist.
 */
r.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  writeLimiter,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

    const force = String(req.query.force ?? "").toLowerCase() === "true";

    try {
      if (!force) {
        // soft delete: mark inactive
        const updated = await prisma.menuItem.update({
          where: { id },
          data: { active: false },
        });
        return res.status(200).json({ ok: true, softDeleted: true, id: updated.id });
      }

      // force hard delete: remove dependent movements then delete the item in a transaction
      await prisma.$transaction(async (tx) => {
        // delete stock movements for this item (if any)
        await tx.stockMovement.deleteMany({ where: { itemId: id } });
        // then delete the item
        await tx.menuItem.delete({ where: { id } });
      });

      return res.status(200).json({ ok: true, deleted: true });
    } catch (e: any) {
      console.error("DELETE /items/:id error (force=%s):", force, e);

      // handle not found
      if (e?.code === "P2025" || /Record to delete does not exist/i.test(e?.message || "")) {
        return res.status(404).json({ error: "not_found" });
      }

      // If foreign key or other constraint persists, return a clear message
      return res.status(500).json({ error: "failed_to_delete_item", detail: e?.message });
    }
  }
);

/**
 * POST /api/items/:id/restore
 * Restore a soft-deleted item by setting active = true
 */
r.post(
  "/:id/restore",
  requireAuth,
  requireAdmin,
  writeLimiter,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

    try {
      const updated = await prisma.menuItem.update({
        where: { id },
        data: { active: true },
      });
      return res.json({ ok: true, id: updated.id });
    } catch (e: any) {
      console.error("POST /items/:id/restore error:", e);
      if (e?.code === "P2025" || /Record to update does not exist/i.test(e?.message || "")) {
        return res.status(404).json({ error: "not_found" });
      }
      return res.status(500).json({ error: "failed_to_restore_item", detail: e?.message });
    }
  }
);

/* ---------------------- Stock endpoints (unchanged) ---------------------- */
/* Keep the existing stock-summary and /:id/stock routes unchanged (they were fine). */

r.get("/stock-summary", async (req, res) => {
  try {
    const items = await prisma.menuItem.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (!items || items.length === 0) {
      return res.json([]);
    }

    const itemIds = items.map((it) => it.id);

    const movements = await prisma.stockMovement.findMany({
      where: { itemId: { in: itemIds } },
      select: { itemId: true, direction: true, quantity: true, qty: true },
    });

    const map: Record<number, number> = {};
    for (const it of items) map[it.id] = 0;

    for (const m of movements) {
      const rawQty = m.qty ?? (m.quantity != null ? Number(m.quantity) : 0);
      const numericQty = typeof rawQty === "string" ? parseFloat(rawQty) : Number(rawQty || 0);
      if (Number.isNaN(numericQty)) continue;
      if (m.direction === "IN") map[m.itemId] += numericQty;
      else map[m.itemId] -= numericQty;
    }

    const out = items.map((it) => ({
      itemId: it.id,
      name: it.name,
      current_qty: String(map[it.id] ?? 0),
    }));

    return res.json(out);
  } catch (e: any) {
    console.error("GET /items/stock-summary error:", e);
    return res.status(500).json({ error: "failed_to_fetch_stock_summary", detail: e?.message });
  }
});

r.get("/:id/stock", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_item_id" });

    const movements = await prisma.stockMovement.findMany({
      where: { itemId: id },
      select: { direction: true, quantity: true, qty: true },
    });

    let total = 0;
    for (const m of movements) {
      const rawQty = m.qty ?? (m.quantity != null ? Number(m.quantity) : 0);
      const numericQty = typeof rawQty === "string" ? parseFloat(rawQty) : Number(rawQty || 0);
      if (Number.isNaN(numericQty)) continue;
      total += m.direction === "IN" ? numericQty : -numericQty;
    }

    return res.json({ item_id: id, current_stock: String(total) });
  } catch (e: any) {
    console.error("GET /items/:id/stock error:", e);
    return res.status(500).json({ error: "failed_to_fetch_item_stock", detail: e?.message });
  }
});

export default r;
