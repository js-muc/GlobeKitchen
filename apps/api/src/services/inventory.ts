import { Prisma, PrismaClient, MovementDirection } from "@prisma/client";

/**
 * Stock on hand for an item:
 * IN  (qty + quantity)
 * - OUT (qty + quantity)
 * - TableSale.qty
 * - FieldDispatch.qtyDispatched
 * + FieldReturn.qtyReturned
 * - FieldReturn.lossQty
 *
 * Handles legacy rows that used StockMovement.quantity (Int) and
 * new rows that use StockMovement.qty (Decimal).
 */
export async function getStockOnHand(
  db: PrismaClient | Prisma.TransactionClient,
  itemId: number
): Promise<number> {
  // IN movements (sum both fields)
  const inAgg = await db.stockMovement.aggregate({
    where: { itemId, direction: MovementDirection.IN },
    _sum: { qty: true, quantity: true },
  });
  const inQty =
    Number(inAgg._sum.qty ?? 0) + Number(inAgg._sum.quantity ?? 0);

  // OUT movements (sum both fields)
  const outAgg = await db.stockMovement.aggregate({
    where: { itemId, direction: MovementDirection.OUT },
    _sum: { qty: true, quantity: true },
  });
  const outQty =
    Number(outAgg._sum.qty ?? 0) + Number(outAgg._sum.quantity ?? 0);

  // Table sales (deduct)
  const salesAgg = await db.tableSale.aggregate({
    where: { itemId },
    _sum: { qty: true },
  });
  const saleQty = Number(salesAgg._sum.qty ?? 0);

  // Field dispatches (deduct)
  const fdAgg = await db.fieldDispatch.aggregate({
    where: { itemId },
    _sum: { qtyDispatched: true },
  });
  const dispQty = Number(fdAgg._sum.qtyDispatched ?? 0);

  // Field returns (add returns, subtract losses)
  const frAgg = await db.fieldReturn.aggregate({
    where: { dispatch: { itemId } },
    _sum: { qtyReturned: true, lossQty: true },
  });
  const retQty = Number(frAgg._sum.qtyReturned ?? 0);
  const lossQty = Number(frAgg._sum.lossQty ?? 0);

  const soh = inQty - outQty - saleQty - dispQty + retQty - lossQty;
  return Number.isFinite(soh) ? soh : 0;
}

/**
 * Per-item transactional advisory lock to avoid race conditions.
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
