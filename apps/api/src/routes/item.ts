// apps/api/src/routes/item.ts
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
  // paginate only if any paging key provided
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
      // original: full array when no paging params
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

// POST /api/items (guarded)
r.post(
  "/",
  requireAuth,
  requireAdmin,
  writeLimiter,
  validateBody(zItemCreate),
  async (req, res) => {
    try {
      const {
        name,
        priceSell,
        unit = "plate",
        category = "Food",
        costUnit = null,
        active = true,
      } = req.body;

      const row = await prisma.menuItem.create({
        data: { name, priceSell, unit, category, costUnit, active },
      });

      return res.status(201).json(serializeItem(row));
    } catch (e: any) {
      console.error("POST /items error:", e);
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
      return res.status(500).json({ error: "failed_to_update_item", detail: e?.message });
    }
  }
);

// DELETE /api/items/:id (guarded) — hard delete, 204 on success
r.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  writeLimiter,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      await prisma.menuItem.delete({ where: { id } });
      return res.status(204).send();
    } catch (e: any) {
      // Prisma P2025 = record not found
      if (e?.code === "P2025" || /Record to delete does not exist/i.test(e?.message || "")) {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("DELETE /items/:id error:", e);
      return res.status(500).json({ error: "failed_to_delete_item", detail: e?.message });
    }
  }
);

export default r;
