// apps/api/src/routes/reports.ts
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const r = Router();

/* ----------------------- Helpers ----------------------- */
function toInt(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getPageParams(q: any) {
  // Only paginate if page OR pageSize/limit is provided (preserve original behavior)
  const hasPaging = q.page !== undefined || q.pageSize !== undefined || q.limit !== undefined;

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
    limit, // normalized (no pageSize in meta)
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}

/* ----------------------- /reports/overview ----------------------- */
/**
 * GET /api/reports/overview
 * Lightweight dashboard summary:
 * - employeesCount
 * - menuItemsCount
 * - stockMovementsToday / stockMovementsMonth
 * - payroll runs in last 90 days + last run stamp
 * - server time
 *
 * NOTE: Kept independent of auth middleware to preserve current behavior (all other routes stay unchanged).
 * If you want it protected, add your auth middleware here.
 */
r.get("/overview", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 90);

    const [
      employeesCount,
      menuItemsCount,
      stockMovementsToday,
      stockMovementsMonth,
      payrollRunsCount,
      lastPayrollRun
    ] = await Promise.all([
      prisma.employee.count(),
      prisma.menuItem.count(),
      prisma.stockMovement.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.stockMovement.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.payrollRun.count({ where: { createdAt: { gte: ninetyDaysAgo } } }),
      prisma.payrollRun.findFirst({
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
    ]);

    return res.json({
      ok: true,
      now: now.toISOString(),
      employeesCount,
      menuItemsCount,
      stockMovementsToday,
      stockMovementsMonth,
      payroll: {
        runsLast90d: payrollRunsCount,
        lastRun: lastPayrollRun ?? null,
      },
    });
  } catch (e: any) {
    console.error("GET /reports/overview error:", e);
    return res.status(500).json({ error: "failed_to_generate_overview", detail: e?.message });
  }
});

/* ----------------------- /reports/stock ----------------------- */
/**
 * GET /api/reports/stock
 *   → all items with stockOnHand (optionally paginated with ?page=&limit=; pageSize alias accepted)
 * GET /api/reports/stock?itemId=18
 *   → single item (includes name)
 */
r.get("/stock", async (req, res) => {
  const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;

  try {
    // ----- Single item (preserved behavior) -----
    if (!Number.isNaN(itemId) && itemId !== undefined) {
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
    const { hasPaging, page, limit, skip, take } = getPageParams(req.query);

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

    // Paginated list
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
      meta: pageMeta(total, page, limit),
    });
  } catch (e: any) {
    console.error("GET /reports/stock error:", e);
    return res.status(500).json({ error: "failed_to_generate_stock_report", detail: e?.message });
  }
});

/* ----------------------- /reports/sales ----------------------- */
/**
 * GET /api/reports/sales?date=YYYY-MM-DD
 * Optionally filter by waiterId: /api/reports/sales?date=...&waiterId=1
 * Returns aggregate totals for the day (table sales + field ops).
 * (Fix: accurate line-item sums; shape preserved)
 */
r.get("/sales", async (req, res) => {
  try {
    const day = req.query.date ? new Date(String(req.query.date)) : new Date();
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end   = new Date(day); end.setHours(23, 59, 59, 999);

    const waiterId = req.query.waiterId ? Number(req.query.waiterId) : undefined;

    // ----- TABLE SALES (accurate sums) -----
    const tableSqlBase = `
      SELECT
        COALESCE(SUM("qty"), 0)                                   AS "qty",
        COALESCE(SUM("qty" * "priceEach"), 0)                     AS "gross",
        COALESCE(SUM("discount"), 0)                              AS "discount",
        COALESCE(SUM("lossQty"), 0)                               AS "lossQty"
      FROM "TableSale"
      WHERE "date" >= $1 AND "date" <= $2
    `;
    const tableSql = waiterId
      ? tableSqlBase + ` AND "waiterId" = $3`
      : tableSqlBase;

    const tableParams = waiterId ? [start, end, waiterId] : [start, end];
    const [tableAgg] = await prisma.$queryRawUnsafe<any[]>(tableSql, ...tableParams);

    // ----- FIELD DISPATCH (accurate sums) -----
    const fdSqlBase = `
      SELECT
        COALESCE(SUM("qtyDispatched"), 0)                         AS "dispatchedQty",
        COALESCE(SUM("qtyDispatched" * COALESCE("priceEach",0)), 0) AS "dispatchedValue"
      FROM "FieldDispatch"
      WHERE "date" >= $1 AND "date" <= $2
    `;
    const fdSql = waiterId
      ? fdSqlBase + ` AND "waiterId" = $3`
      : fdSqlBase;

    const fdParams = waiterId ? [start, end, waiterId] : [start, end];
    const [dispatchAgg] = await prisma.$queryRawUnsafe<any[]>(fdSql, ...fdParams);

    // ----- FIELD RETURN (same semantics as before; not filtered by waiter) -----
    const [returnAgg] = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COALESCE(SUM("qtyReturned"), 0)                           AS "returnedQty",
        COALESCE(SUM("cashCollected"), 0)                         AS "cashCollected",
        COALESCE(SUM("lossQty"), 0)                               AS "returnLossQty"
      FROM "FieldReturn"
      WHERE "createdAt" >= $1 AND "createdAt" <= $2;
    `, start, end);

    // Normalize numbers
    const tableQty        = Number(tableAgg?.qty ?? 0);
    const tableGross      = Number(tableAgg?.gross ?? 0);
    const tableDiscount   = Number(tableAgg?.discount ?? 0);
    const tableLoss       = Number(tableAgg?.lossQty ?? 0);

    const dispatchedQty   = Number(dispatchAgg?.dispatchedQty ?? 0);
    const dispatchedValue = Number(dispatchAgg?.dispatchedValue ?? 0);

    const returnedQty     = Number(returnAgg?.returnedQty ?? 0);
    const cashCollected   = Number(returnAgg?.cashCollected ?? 0);
    const returnLossQty   = Number(returnAgg?.returnLossQty ?? 0);

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
        dispatchedQty,
        dispatchedValue,
        returnedQty,
        returnLossQty,
        cashCollected,
      },
    });
  } catch (e: any) {
    console.error("GET /reports/sales error:", e);
    return res.status(500).json({ error: "failed_to_generate_sales_report", detail: e?.message });
  }
});

export default r;
