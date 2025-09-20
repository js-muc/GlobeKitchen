import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate";
import { zEmployeeCreate, zEmployeeUpdate } from "../schemas";
import { writeLimiter } from "../middlewares/rateLimit";

const prisma = new PrismaClient();
const r = Router();

// Local helpers (keep file self-contained; same pattern as items.ts)
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
    // Original logic (preserved): return full array when no pagination params
    const rows = await prisma.employee.findMany({ orderBy: { id: "asc" } });
    return res.json(rows);
  }

  // Paginated response when page/pageSize is provided
  const [rows, total] = await Promise.all([
    prisma.employee.findMany({ orderBy: { id: "asc" }, skip, take }),
    prisma.employee.count(),
  ]);
  return res.json({ data: rows, meta: pageMeta(total, page, pageSize) });
});

r.post("/", writeLimiter, validateBody(zEmployeeCreate), async (req, res) => {
  const { name, role = "WAITER", type = "INSIDE", tableCode = null, phone = null, active = true } = req.body;
  const row = await prisma.employee.create({ data: { name, role, type, tableCode, phone, active } as any });
  res.status(201).json(row);
});

r.put("/:id", writeLimiter, validateBody(zEmployeeUpdate), async (req, res) => {
  const id = Number(req.params.id);
  const { name, role, type, tableCode, phone, active } = req.body;
  const row = await prisma.employee.update({ where: { id }, data: { name, role, type, tableCode, phone, active } as any });
  res.json(row);
});

r.delete("/:id", writeLimiter, async (req, res) => {
  const id = Number(req.params.id);
  await prisma.employee.delete({ where: { id } });
  res.status(204).end();
});

export default r;
