// apps/api/src/routes/fieldReturn.ts
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate.js";
import { zFieldReturnCreate } from "../schemas/index.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const prisma = new PrismaClient();
const r = Router();

/* ----------------------- Helpers ----------------------- */
// Keep file self-contained (same pattern as other routes)
function toInt(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getPageParams(q: any) {
  // Only paginate if page or pageSize/limit provided (preserve original behavior)
  const hasPaging =
    q.page !== undefined || q.pageSize !== undefined || q.limit !== undefined;

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
    limit, // normalized (no pageSize)
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}

function serializeReturn(row: any) {
  return {
    id: row.id,
    dispatchId: row.dispatchId,
    qtyReturned: Number(row.qtyReturned),
    lossQty: Number(row.lossQty ?? 0),
    cashCollected: row.cashCollected != null ? String(row.cashCollected) : null,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ------------------------ Routes ----------------------- */

/** POST /api/field-return */
r.post(
  "/",
  requireAuth,
  requireAdmin,
  writeLimiter,
  validateBody(zFieldReturnCreate),
  async (req, res) => {
    const {
      dispatchId,
      qtyReturned,
      cashCollected = 0,
      note = null,
      lossQty = 0,
    } = req.body;

    try {
      // 1) Find the dispatch to enforce business rule
      const dispatch = await prisma.fieldDispatch.findUnique({
        where: { id: Number(dispatchId) },
      });
      if (!dispatch) {
        return res
          .status(400)
          .json({ error: "dispatch_not_found", message: "dispatchId does not exist" });
      }

      // 2) Guard: returned + loss must not exceed dispatched
      const totalReturned = Number(qtyReturned) + Number(lossQty || 0);
      if (totalReturned > Number(dispatch.qtyDispatched)) {
        return res.status(400).json({
          error: "return_exceeds_dispatch",
          message: `Returned (${qtyReturned}) + loss (${lossQty}) exceeds dispatched (${dispatch.qtyDispatched})`,
          dispatchId: dispatch.id,
          qtyDispatched: Number(dispatch.qtyDispatched),
          attemptedReturned: Number(qtyReturned),
          attemptedLoss: Number(lossQty),
        });
      }

      // 3) Create return (unique per dispatch enforced by DB)
      const row = await prisma.fieldReturn.create({
        data: {
          dispatchId: Number(dispatchId),
          qtyReturned: Number(qtyReturned),
          lossQty: Number(lossQty),
          cashCollected: Number(cashCollected), // Prisma Decimal; we serialize as string in responses
          note,
        },
      });

      return res.status(201).json(serializeReturn(row));
    } catch (e: any) {
      if (e?.code === "P2002") {
        return res
          .status(409)
          .json({
            error: "duplicate_return",
            message: "Return already recorded for this dispatchId",
          });
      }
      if (e?.code === "P2003") {
        return res
          .status(400)
          .json({ error: "dispatch_not_found", message: "dispatchId does not exist" });
      }
      return res
        .status(500)
        .json({ error: "failed_to_create_field_return", detail: e?.message });
    }
  }
);

/**
 * GET /api/field-return
 * Filters: ?dispatchId=
 * Pagination: ?page=&limit=  (pageSize alias accepted)
 * Behavior:
 *  - No paging params -> plain array (original behavior)
 *  - With paging params -> { data, meta }
 */
r.get("/", async (req, res) => {
  const dispatchId = req.query.dispatchId ? Number(req.query.dispatchId) : undefined;

  const where: any = {};
  if (!Number.isNaN(dispatchId) && dispatchId !== undefined) where.dispatchId = dispatchId;

  const { hasPaging, page, limit, skip, take } = getPageParams(req.query);

  try {
    if (!hasPaging) {
      // ✅ Original behavior
      const rows = await prisma.fieldReturn.findMany({
        where,
        orderBy: { id: "desc" },
      });
      return res.json(rows.map(serializeReturn));
    }

    // ✅ Paginated response
    const [rows, total] = await Promise.all([
      prisma.fieldReturn.findMany({ where, orderBy: { id: "desc" }, skip, take }),
      prisma.fieldReturn.count({ where }),
    ]);

    return res.json({
      data: rows.map(serializeReturn),
      meta: pageMeta(total, page, limit),
    });
  } catch (e: any) {
    console.error("GET /field-return error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_fetch_field_returns", detail: e?.message });
  }
});

export default r;
