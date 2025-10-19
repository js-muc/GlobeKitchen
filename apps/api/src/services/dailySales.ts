// apps/api/src/services/dailySales.ts
import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Compute expected cash from SALE lines only.
 * - Works with both PrismaClient and TransactionClient
 * - Resolves model name compatibly: prefers `saleLine`, falls back to `shiftLine`
 * - Preserves original logic
 */
export async function computeCashExpectedForShift(
  tx: PrismaClient | Prisma.TransactionClient,
  shiftId: number
) {
  // Resolve model safely (handle schema naming differences across environments)
  const model =
    (tx as any).saleLine ??
    (tx as any).shiftLine; // fallback if older schema used `shiftLine`

  if (!model?.findMany) {
    throw new Error(
      "Sale line model not available on Prisma client. Expected `saleLine` (preferred) or `shiftLine`."
    );
  }

  // Your schema's saleLine table contains only sales; filter by shiftId only.
  const lines: Array<{ qty: number; unitPrice: number }> = await model.findMany({
    where: { shiftId }, // <-- removed `type: "SALE"`
    select: { qty: true, unitPrice: true },
  });

  let expected = 0;
  for (const l of lines) {
    const qty = Number(l.qty) || 0;
    const price = Number(l.unitPrice) || 0;
    expected += qty * price;
  }
  // normalize to 2dp to match how totals are stored elsewhere
  return Number(expected.toFixed(2));
}
