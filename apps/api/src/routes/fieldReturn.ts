import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate";
import { zFieldReturnCreate } from "../schemas";
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

/** POST /api/field-return */
r.post("/", writeLimiter, validateBody(zFieldReturnCreate), async (req, res) => {
  const { dispatchId, qtyReturned, cashCollected = 0, note = null } = req.body;
  try {
    const row = await prisma.fieldReturn.create({
      data: {
        dispatchId: Number(dispatchId),
        qtyReturned: Number(qtyReturned),
        cashCollected: Number(cashCollected),
        note,
      },
    });
    return res.status(201).json(row);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Return already recorded for this dispatchId" });
    if (e.code === "P2003") return res.status(400).json({ error: "dispatchId does not exist" });
    return res.status(500).json({ error: "failed to create field return", detail: e?.message });
  }
});

/**
 * GET /api/field-return
 * Filters: ?dispatchId=
 * Pagination: ?page=&pageSize=
 * Behavior:
 *  - No page/pageSize -> plain array (original behavior)
 *  - With page/pageSize -> { data, meta }
 */
r.get("/", async (req, res) => {
  const dispatchId = req.query.dispatchId ? Number(req.query.dispatchId) : undefined;

  const where: any = {};
  if (dispatchId) where.dispatchId = dispatchId;

  const { hasPaging, page, pageSize, skip, take } = getPageParams(req.query);

  if (!hasPaging) {
    const rows = await prisma.fieldReturn.findMany({
      where,
      orderBy: { id: "desc" },
    });
    return res.json(rows);
  }

  const [rows, total] = await Promise.all([
    prisma.fieldReturn.findMany({ where, orderBy: { id: "desc" }, skip, take }),
    prisma.fieldReturn.count({ where }),
  ]);
  return res.json({ data: rows, meta: pageMeta(total, page, pageSize) });
});

export default r;
