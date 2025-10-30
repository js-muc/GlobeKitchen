// apps/api/src/services/dailySales.ts
import { PrismaClient, type Prisma } from "@prisma/client";

/** Robust numeric coercion that accepts number | string | bigint | Decimal-like */
function toNum(v: unknown): number {
  if (v == null) return 0;
  // Prisma Decimal (modern: @prisma/client/runtime/library)
  if (typeof (v as any)?.toNumber === "function") return (v as any).toNumber();
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v) || 0;
  if (typeof v === "number") return v;
  return Number(v as any) || 0;
}

/**
 * Compute expected cash for a shift from line items.
 * - Works with both PrismaClient and TransactionClient
 * - Resolves model name compatibly: prefers `saleLine`, falls back to `shiftLine`
 * - Excludes VOID / DELETED lines (if those columns exist)
 * - Excludes RETURNS by default (can be included via options)
 * - Normalizes totals to 2 dp
 */
export async function computeCashExpectedForShift(
  tx: PrismaClient | Prisma.TransactionClient,
  shiftId: number,
  opts?: {
    /** Include lines whose type is RETURN (or negative qty). Default: false */
    includeReturns?: boolean;
    /** Include voided/deleted lines if your schema has those flags. Default: false */
    includeVoids?: boolean;
  }
) {
  const { includeReturns = false, includeVoids = false } = opts ?? {};

  // Resolve model safely across schema versions
  const model =
    (tx as any).saleLine ??
    (tx as any).shiftLine; // fallback if older schema used `shiftLine`

  if (!model?.findMany) {
    throw new Error(
      "Sale line model not available on Prisma client. Expected `saleLine` (preferred) or `shiftLine`."
    );
  }

  // Try to select optional fields if they exist; fall back to minimal select if not.
  type RawLine = {
    qty?: any;
    unitPrice?: any;
    type?: string | null;         // e.g., 'SALE' | 'RETURN'
    status?: string | null;       // e.g., 'OK' | 'VOID'
    isVoid?: boolean | null;
    voided?: boolean | null;
    isDeleted?: boolean | null;
    deletedAt?: Date | null;
  };

  let lines: RawLine[] = [];
  try {
    // Attempt rich select (if columns don't exist, Prisma will throw)
    lines = await model.findMany({
      where: { shiftId },
      select: {
        qty: true,
        unitPrice: true,
        type: true,
        status: true,
        isVoid: true,
        voided: true,
        isDeleted: true,
        deletedAt: true,
      },
    });
  } catch {
    // Minimal schema fallback
    lines = await model.findMany({
      where: { shiftId },
      select: { qty: true, unitPrice: true },
    });
  }

  // Filter lines according to available fields and options
  const usable = lines.filter((l) => {
    // Exclude deleted if flagged
    const deleted =
      (typeof l.isDeleted === "boolean" && l.isDeleted) ||
      (l.deletedAt instanceof Date);

    if (deleted && !includeVoids) return false;

    // Exclude voids if flagged
    const isVoid =
      (typeof l.isVoid === "boolean" && l.isVoid) ||
      (typeof l.voided === "boolean" && l.voided) ||
      (typeof l.status === "string" && l.status.toUpperCase() === "VOID");

    if (isVoid && !includeVoids) return false;

    // Exclude returns unless requested
    const isReturn =
      typeof l.type === "string" && l.type.toUpperCase() === "RETURN";
    if (isReturn && !includeReturns) return false;

    return true;
  });

  // Sum up qty * unitPrice (supports Decimal/bigint/etc.)
  let expected = 0;
  for (const l of usable) {
    const qty = toNum(l.qty);
    const price = toNum(l.unitPrice);
    expected += qty * price;
  }

  // Normalize to 2dp
  return Number(expected.toFixed(2));
}
