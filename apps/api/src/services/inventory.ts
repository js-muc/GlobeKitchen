import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Compute stock on hand for a single itemId.
 * Formula:
 *   IN
 * - OUT
 * - TableSale.qty
 * - FieldDispatch.qtyDispatched
 * + FieldReturn.qtyReturned
 * - FieldReturn.lossQty
 */
export async function getStockOnHand(
  db: PrismaClient | Prisma.TransactionClient,
  itemId: number
): Promise<number> {
  const rows = await db.$queryRaw<{ stockOnHand: number | null }[]>`
    WITH
    sm AS (
      SELECT
        SUM(CASE WHEN "direction" = 'IN'  THEN "quantity" ELSE 0 END) AS in_qty,
        SUM(CASE WHEN "direction" = 'OUT' THEN "quantity" ELSE 0 END) AS out_qty
      FROM "StockMovement"
      WHERE "itemId" = ${itemId}
    ),
    ts AS (
      SELECT SUM("qty") AS sale_qty
      FROM "TableSale"
      WHERE "itemId" = ${itemId}
    ),
    fd AS (
      SELECT SUM("qtyDispatched") AS disp_qty
      FROM "FieldDispatch"
      WHERE "itemId" = ${itemId}
    ),
    fr AS (
      SELECT
        SUM(fr."qtyReturned") AS ret_qty,
        SUM(fr."lossQty")     AS loss_qty
      FROM "FieldReturn" fr
      JOIN "FieldDispatch" fd2 ON fd2.id = fr."dispatchId"
      WHERE fd2."itemId" = ${itemId}
    )
    SELECT
      COALESCE(sm.in_qty, 0)
      - COALESCE(sm.out_qty, 0)
      - COALESCE(ts.sale_qty, 0)
      - COALESCE(fd.disp_qty, 0)
      + COALESCE(fr.ret_qty, 0)
      - COALESCE(fr.loss_qty, 0) AS "stockOnHand"
    FROM sm
    CROSS JOIN ts
    CROSS JOIN fd
    CROSS JOIN fr;
  `;

  const val = rows[0]?.stockOnHand ?? 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Per-item transactional lock to avoid race conditions when decreasing stock.
 * Uses pg_advisory_xact_lock(itemId) inside a single transaction.
 */
export async function withItemLock<T>(
  prisma: PrismaClient,
  itemId: number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${itemId})`;
    return fn(tx);
  });
}
