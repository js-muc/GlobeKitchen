import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate";
import { zItemCreate, zItemUpdate } from "../schemas";
import { writeLimiter } from "../middlewares/rateLimit";

const prisma = new PrismaClient();
const r = Router();

// Small local helpers so we don't introduce new imports yet
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

r.get("/", async (req, res) => {
  const { hasPaging, page, pageSize, skip, take } = getPageParams(req.query);

  if (!hasPaging) {
    // Original logic (preserved): return the full array when no pagination params are provided
    const rows = await prisma.menuItem.findMany({ orderBy: { name: "asc" } });
    return res.json(rows);
  }

  // Paginated response when page/pageSize is provided
  const [rows, total] = await Promise.all([
    prisma.menuItem.findMany({ orderBy: { name: "asc" }, skip, take }),
    prisma.menuItem.count(),
  ]);
  return res.json({ data: rows, meta: pageMeta(total, page, pageSize) });
});

r.post("/", writeLimiter, validateBody(zItemCreate), async (req, res) => {
  const { name, priceSell, unit = "plate", category = "Food", costUnit = null, active = true } = req.body;
  const row = await prisma.menuItem.create({ data: { name, priceSell, unit, category, costUnit, active } });
  res.status(201).json(row);
});

r.put("/:id", writeLimiter, validateBody(zItemUpdate), async (req, res) => {
  const id = Number(req.params.id);
  const { name, priceSell, unit, category, costUnit, active } = req.body;
  const row = await prisma.menuItem.update({ where: { id }, data: { name, priceSell, unit, category, costUnit, active } });
  res.json(row);
});

export default r;
