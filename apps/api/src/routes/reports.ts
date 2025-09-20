import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const r = Router();

// --- helpers for optional pagination (same pattern as other routes) ---
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
 * GET /api/reports/stock
 *   → all items with stockOnHand (optionally paginated with ?page=&pageSize=)
 * GET /api/reports/stock?itemId=18
 *   → single item (includes name)
 */
r.get("/stock", async (req, res) => {
  const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;

  // ----- Single item (unchanged behavior) -----
  if (itemId) {
    const rows = await prisma.$queryRaw<
      { itemId: number; name: string; stockOnHand: number | null }[]
    >`
      WITH
      sm AS (
        SELECT
          SUM(CASE WHEN "direction"='IN'  THEN "quantity" ELSE 0 END) AS in_qty,
          SUM(CASE WHEN "direction"='OUT' THEN "quantity" ELSE 0 END) AS out_qty
        FROM "StockMovement" WHERE "itemId" = ${itemId}
      ),
      ts AS (SELECT SUM("qty") AS sale_qty FROM "TableSale" WHERE "itemId"=${itemId}),
      fd AS (SELECT SUM("qtyDispatched") AS disp_qty FROM "FieldDispatch" WHERE "itemId"=${itemId}),
      fr AS (
        SELECT
          SUM(fr."qtyReturned") AS ret_qty,
          SUM(fr."lossQty")     AS loss_qty
        FROM "FieldReturn" fr
        JOIN "FieldDispatch" fd2 ON fd2.id = fr."dispatchId"
        WHERE fd2."itemId" = ${itemId}
      )
      SELECT mi.id AS "itemId", mi.name,
        COALESCE(sm.in_qty,0)
      - COALESCE(sm.out_qty,0)
      - COALESCE(ts.sale_qty,0)
      - COALESCE(fd.disp_qty,0)
      + COALESCE(fr.ret_qty,0)
      - COALESCE(fr.loss_qty,0) AS "stockOnHand"
      FROM "MenuItem" mi
      LEFT JOIN sm ON TRUE
      LEFT JOIN ts ON TRUE
      LEFT JOIN fd ON TRUE
      LEFT JOIN fr ON TRUE
      WHERE mi.id = ${itemId};
    `;
    const r0 = rows[0] ?? { itemId, name: "", stockOnHand: 0 };
    const n = Number(r0.stockOnHand ?? 0);
    return res.json({
      itemId: r0.itemId,
      name: r0.name,
      stockOnHand: Number.isFinite(n) ? n : 0,
    });
  }

  // ----- All items (with optional pagination) -----
  const { hasPaging, page, pageSize, skip, take } = getPageParams(req.query);

  if (!hasPaging) {
    const rows = await prisma.$queryRaw<
      { itemId: number; name: string; stockOnHand: number | null }[]
    >`
      WITH sm AS (
        SELECT "itemId",
          SUM(CASE WHEN "direction"='IN'  THEN "quantity" ELSE 0 END) AS in_qty,
          SUM(CASE WHEN "direction"='OUT' THEN "quantity" ELSE 0 END) AS out_qty
        FROM "StockMovement" GROUP BY "itemId"
      ),
      ts AS (SELECT "itemId", SUM("qty") AS sale_qty FROM "TableSale" GROUP BY "itemId"),
      fd AS (SELECT "itemId", SUM("qtyDispatched") AS disp_qty FROM "FieldDispatch" GROUP BY "itemId"),
      fr AS (
        SELECT fd2."itemId",
               SUM(fr."qtyReturned") AS ret_qty,
               SUM(fr."lossQty")     AS loss_qty
        FROM "FieldReturn" fr
        JOIN "FieldDispatch" fd2 ON fd2.id = fr."dispatchId"
        GROUP BY fd2."itemId"
      )
      SELECT mi.id AS "itemId", mi.name,
        COALESCE(sm.in_qty,0)
      - COALESCE(sm.out_qty,0)
      - COALESCE(ts.sale_qty,0)
      - COALESCE(fd.disp_qty,0)
      + COALESCE(fr.ret_qty,0)
      - COALESCE(fr.loss_qty,0) AS "stockOnHand"
      FROM "MenuItem" mi
      LEFT JOIN sm ON sm."itemId" = mi.id
      LEFT JOIN ts ON ts."itemId" = mi.id
      LEFT JOIN fd ON fd."itemId" = mi.id
      LEFT JOIN fr ON fr."itemId" = mi.id
      ORDER BY mi.name ASC;
    `;
    return res.json(rows.map(r => ({ ...r, stockOnHand: Number(r.stockOnHand ?? 0) })));
  }

  // paginated
  const [rows, total] = await Promise.all([
    prisma.$queryRaw<
      { itemId: number; name: string; stockOnHand: number | null }[]
    >`
      WITH sm AS (
        SELECT "itemId",
          SUM(CASE WHEN "direction"='IN'  THEN "quantity" ELSE 0 END) AS in_qty,
          SUM(CASE WHEN "direction"='OUT' THEN "quantity" ELSE 0 END) AS out_qty
        FROM "StockMovement" GROUP BY "itemId"
      ),
      ts AS (SELECT "itemId", SUM("qty") AS sale_qty FROM "TableSale" GROUP BY "itemId"),
      fd AS (SELECT "itemId", SUM("qtyDispatched") AS disp_qty FROM "FieldDispatch" GROUP BY "itemId"),
      fr AS (
        SELECT fd2."itemId",
               SUM(fr."qtyReturned") AS ret_qty,
               SUM(fr."lossQty")     AS loss_qty
        FROM "FieldReturn" fr
        JOIN "FieldDispatch" fd2 ON fd2.id = fr."dispatchId"
        GROUP BY fd2."itemId"
      )
      SELECT mi.id AS "itemId", mi.name,
        COALESCE(sm.in_qty,0)
      - COALESCE(sm.out_qty,0)
      - COALESCE(ts.sale_qty,0)
      - COALESCE(fd.disp_qty,0)
      + COALESCE(fr.ret_qty,0)
      - COALESCE(fr.loss_qty,0) AS "stockOnHand"
      FROM "MenuItem" mi
      LEFT JOIN sm ON sm."itemId" = mi.id
      LEFT JOIN ts ON ts."itemId" = mi.id
      LEFT JOIN fd ON fd."itemId" = mi.id
      LEFT JOIN fr ON fr."itemId" = mi.id
      ORDER BY mi.name ASC
      LIMIT ${take} OFFSET ${skip};
    `,
    prisma.menuItem.count(),
  ]);

  const normalized = rows.map(r => ({ ...r, stockOnHand: Number(r.stockOnHand ?? 0) }));
  return res.json({
    data: normalized,
    meta: pageMeta(total, page, pageSize),
  });
});

/**
 * GET /api/reports/sales?date=YYYY-MM-DD
 * Optionally filter by waiterId: /api/reports/sales?date=...&waiterId=1
 * Returns aggregate totals for the day (table sales + field ops).
 * (Logic preserved: gross = sum(qty) * sum(priceEach) proxy)
 */
r.get("/sales", async (req, res) => {
  const day = req.query.date ? new Date(String(req.query.date)) : new Date();
  const start = new Date(day); start.setHours(0,0,0,0);
  const end   = new Date(day); end.setHours(23,59,59,999);

  const waiterId = req.query.waiterId ? Number(req.query.waiterId) : undefined;
  const whereWaiter = waiterId ? { waiterId } : undefined;

  const [tableSales, fieldDispatch, fieldReturn] = await Promise.all([
    prisma.tableSale.aggregate({
      _sum: { qty: true, priceEach: true, discount: true, lossQty: true },
      where: { date: { gte: start, lte: end }, ...whereWaiter },
    }),
    prisma.fieldDispatch.aggregate({
      _sum: { qtyDispatched: true, priceEach: true },
      where: { date: { gte: start, lte: end }, ...whereWaiter },
    }),
    prisma.fieldReturn.aggregate({
      _sum: { qtyReturned: true, cashCollected: true, lossQty: true },
      where: { createdAt: { gte: start, lte: end } },
    }),
  ]);

  const tableQty = Number(tableSales._sum.qty ?? 0);
  const tableGross = Number(tableSales._sum.qty ?? 0) * Number(tableSales._sum.priceEach ?? 0); // proxy
  const tableDiscount = Number(tableSales._sum.discount ?? 0);
  const tableLoss = Number(tableSales._sum.lossQty ?? 0);

  const dispatchQty = Number(fieldDispatch._sum.qtyDispatched ?? 0);
  const dispatchValue = Number(fieldDispatch._sum.qtyDispatched ?? 0) * Number(fieldDispatch._sum.priceEach ?? 0); // proxy

  const returnQty = Number(fieldReturn._sum.qtyReturned ?? 0);
  const cashCollected = Number(fieldReturn._sum.cashCollected ?? 0);
  const returnLoss = Number(fieldReturn._sum.lossQty ?? 0);

  return res.json({
    date: start.toISOString().slice(0, 10),
    ...(waiterId ? { waiterId } : {}),
    table: {
      qty: tableQty,
      gross: tableGross,
      discount: tableDiscount,
      lossQty: tableLoss,
      net: Math.max(tableGross - tableDiscount, 0),
    },
    field: {
      dispatchedQty: dispatchQty,
      dispatchedValue: dispatchValue,
      returnedQty: returnQty,
      returnLossQty: returnLoss,
      cashCollected,
    },
  });
});

export default r;
