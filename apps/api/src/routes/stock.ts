// apps/api/src/routes/stock.ts
import { Router } from "express";
import { PrismaClient, MovementDirection } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { writeLimiter } from "../middlewares/rateLimit.js";

const prisma = new PrismaClient();
const r = Router();

/* ------------------------- Zod Schemas ------------------------- */
const zId = z.coerce.number().int().positive();

const zPaged = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  lowStockLt: z.coerce.number().optional(), // optional threshold alert (computed)
});

const zBaseMovement = z.object({
  itemId: z.coerce.number().int().positive(),
  date: z.string().datetime().optional(), // we’ll store on createdAt only (schema has createdAt)
  note: z.string().max(300).optional(),
});

// PURCHASE (IN) — optional unitCost
const zPurchase = zBaseMovement.extend({
  direction: z.literal("IN"),
  quantity: z.coerce.number().int().positive(), // > 0
  unitCost: z.coerce.number().nonnegative().optional(),
});

// USAGE (OUT)
const zUsage = zBaseMovement.extend({
  direction: z.literal("OUT"),
  quantity: z.coerce.number().int().positive(), // > 0
});

const zUpsertMovement = z.discriminatedUnion("direction", [zPurchase, zUsage]);

/* ------------------------- Helpers ------------------------- */

/** Signed delta for a movement (IN adds, OUT subtracts). */
function movementDelta(direction: MovementDirection, qty: number): number {
  return direction === "IN" ? +qty : -qty;
}

/** Compute balance (IN - OUT) for an item using existing schema fields. */
async function getItemBalance(tx: PrismaClient, itemId: number): Promise<number> {
  // Sum IN
  const inAgg = await tx.stockMovement.aggregate({
    where: { itemId, direction: "IN" },
    _sum: { quantity: true },
  });
  const totalIn = Number(inAgg._sum.quantity ?? 0);

  // Sum OUT
  const outAgg = await tx.stockMovement.aggregate({
    where: { itemId, direction: "OUT" },
    _sum: { quantity: true },
  });
  const totalOut = Number(outAgg._sum.quantity ?? 0);

  return totalIn - totalOut;
}

/** Create a movement and ensure non-negative balance for OUT. */
async function createMovementAndCheck(payload: z.infer<typeof zUpsertMovement>) {
  const { itemId, direction, quantity, note } = payload;
  const unitCost =
    (payload as any).unitCost !== undefined ? Number((payload as any).unitCost) : undefined;

  return await prisma.$transaction(async (tx) => {
    const before = await getItemBalance(tx as any, itemId);

    const after = before + movementDelta(direction as MovementDirection, Number(quantity));
    if (after < 0) {
      throw new Error("Insufficient stock for this operation");
    }

    const mv = await tx.stockMovement.create({
      data: {
        itemId,
        direction: direction as MovementDirection,
        quantity: Number(quantity),
        unitCost: unitCost ?? null,
        note: note ?? null,
        // schema uses createdAt; we ignore payload.date or keep it in note if needed
      },
    });

    return { movement: mv, balanceBefore: before, balanceAfter: after };
  });
}

/** Reverse a movement’s effect logically (used by edit/delete checks). */
function reverseDelta(direction: MovementDirection, qty: number): number {
  // If original was IN(+q), reverse is -q; if OUT(-q), reverse is +q
  return -movementDelta(direction, qty);
}

/* ------------------------- Routes ------------------------- */

// List current stock (by MenuItem) with computed balances
r.get("/", requireAuth, async (req, res) => {
  const params = zPaged.safeParse(req.query);
  if (!params.success) return res.status(400).json({ error: params.error.flatten() });
  const { page, limit, q, category, lowStockLt } = params.data;

  const where: any = {};
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (category) where.category = { equals: category };

  // Get items for this page
  const [items, total] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        unit: true,
        category: true,
        priceSell: true,
        createdAt: true,
      },
    }),
    prisma.menuItem.count({ where }),
  ]);

  const ids = items.map((i) => i.id);
  if (ids.length === 0) {
    return res.json({ page, limit, total, data: [] });
  }

  // Aggregate IN and OUT per item for these ids
  const [inAgg, outAgg] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ["itemId"],
      where: { itemId: { in: ids }, direction: "IN" },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.groupBy({
      by: ["itemId"],
      where: { itemId: { in: ids }, direction: "OUT" },
      _sum: { quantity: true },
    }),
  ]);

  const inMap = new Map<number, number>();
  const outMap = new Map<number, number>();
  inAgg.forEach((r) => inMap.set(r.itemId, Number(r._sum.quantity ?? 0)));
  outAgg.forEach((r) => outMap.set(r.itemId, Number(r._sum.quantity ?? 0)));

  let rows = items.map((it) => {
    const totalIn = inMap.get(it.id) ?? 0;
    const totalOut = outMap.get(it.id) ?? 0;
    const currentStock = totalIn - totalOut;
    return { ...it, currentStock };
  });

  // Optional lowStock filter is applied after computing balances
  if (typeof lowStockLt === "number") {
    rows = rows.filter((r) => r.currentStock < lowStockLt);
  }

  res.json({
    page,
    limit,
    total,
    data: rows,
  });
});

// Create movement (IN / OUT)
r.post("/movement", requireAuth, writeLimiter, async (req, res) => {
  const body = zUpsertMovement.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  try {
    const result = await createMovementAndCheck(body.data);
    res.status(201).json({ ok: true, ...result });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message ?? "movement_failed" });
  }
});

// List movements (filter by item/date/direction)
r.get("/movements", requireAuth, async (req, res) => {
  const zQuery = z.object({
    itemId: z.coerce.number().int().positive().optional(),
    direction: z.nativeEnum(MovementDirection).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(20),
  });

  const qp = zQuery.safeParse(req.query);
  if (!qp.success) return res.status(400).json({ error: qp.error.flatten() });

  const { itemId, direction, dateFrom, dateTo, page, limit } = qp.data;
  const where: any = {};
  if (itemId) where.itemId = itemId;
  if (direction) where.direction = direction;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        itemId: true,
        direction: true,
        quantity: true,
        unitCost: true,
        note: true,
        createdAt: true,
        item: { select: { name: true, unit: true, category: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  res.json({ page, limit, total, data: rows });
});

// Edit movement (supports changing itemId/direction/quantity/unitCost/note)
r.put("/movement/:id", requireAuth, writeLimiter, async (req, res) => {
  const movementId = zId.safeParse(req.params.id);
  if (!movementId.success) return res.status(400).json({ error: "invalid id" });

  const zPartial = z.object({
    itemId: z.coerce.number().int().positive().optional(),
    direction: z.nativeEnum(MovementDirection).optional(),
    quantity: z.coerce.number().int().positive().optional(),
    unitCost: z.coerce.number().nonnegative().optional(),
    note: z.string().max(300).optional(),
  });

  const payload = zPartial.safeParse(req.body);
  if (!payload.success) return res.status(400).json({ error: payload.error.flatten() });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const old = await tx.stockMovement.findUnique({
        where: { id: movementId.data },
        select: { id: true, itemId: true, direction: true, quantity: true },
      });
      if (!old) throw new Error("Movement not found");

      // Current balances for old and maybe new item
      const currentOldBal = await getItemBalance(tx as any, old.itemId);
      const revertedBal = currentOldBal + reverseDelta(old.direction, Number(old.quantity)); // remove old effect

      // New values
      const newItemId = payload.data.itemId ?? old.itemId;
      const newDirection = (payload.data.direction ?? old.direction) as MovementDirection;
      const newQty = Number(payload.data.quantity ?? old.quantity);
      const newUnitCost =
        payload.data.unitCost !== undefined ? Number(payload.data.unitCost) : undefined;

      // If item changes, we must check *both* items
      if (newItemId !== old.itemId) {
        // Old item balance after removing old effect
        if (revertedBal < 0) throw new Error("Edit would break old item balance");

        // New item balance before applying new effect
        const newItemBal = await getItemBalance(tx as any, newItemId);
        const newItemAfter = newItemBal + movementDelta(newDirection, newQty);
        if (newItemAfter < 0) throw new Error("Insufficient stock for target item after edit");
      } else {
        // Same item: check reverted + new delta
        const after = revertedBal + movementDelta(newDirection, newQty);
        if (after < 0) throw new Error("Insufficient stock after edit");
      }

      const updated = await tx.stockMovement.update({
        where: { id: movementId.data },
        data: {
          itemId: newItemId,
          direction: newDirection,
          quantity: newQty,
          unitCost: newUnitCost ?? undefined,
          note: payload.data.note ?? undefined,
        },
      });

      return { updated };
    });

    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message ?? "edit_failed" });
  }
});

// Delete movement (admin only by default) — ensure not breaking balance
r.delete("/movement/:id", requireAdmin, writeLimiter, async (req, res) => {
  const movementId = zId.safeParse(req.params.id);
  if (!movementId.success) return res.status(400).json({ error: "invalid id" });

  try {
    await prisma.$transaction(async (tx) => {
      const mv = await tx.stockMovement.findUnique({
        where: { id: movementId.data },
        select: { id: true, itemId: true, direction: true, quantity: true },
      });
      if (!mv) throw new Error("Movement not found");

      const currentBal = await getItemBalance(tx as any, mv.itemId);
      const afterDelete = currentBal + reverseDelta(mv.direction, Number(mv.quantity));
      if (afterDelete < 0) {
        throw new Error("Cannot delete; would produce negative stock");
      }

      await tx.stockMovement.delete({ where: { id: movementId.data } });
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message ?? "delete_failed" });
  }
});

export default r;
