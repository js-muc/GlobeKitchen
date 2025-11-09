import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// Same fixed brackets you provided
const COMMISSION_BRACKETS = [
  { from: 100,   to: 500,    amount: 100 },
  { from: 501,   to: 750,    amount: 200 },
  { from: 751,   to: 1000,   amount: 300 },
  { from: 1001,  to: 1500,   amount: 350 },
  { from: 1501,  to: 2000,   amount: 400 },
  { from: 2001,  to: 2500,   amount: 450 },
  { from: 2501,  to: 3000,   amount: 500 },
  { from: 3001,  to: 3500,   amount: 550 },
  { from: 3501,  to: 4000,   amount: 600 },
  { from: 4001,  to: 4500,   amount: 650 },
  { from: 4501,  to: 5000,   amount: 700 },
  { from: 5001,  to: 5500,   amount: 750 },
  { from: 5501,  to: 6000,   amount: 800 },
  { from: 6001,  to: 6500,   amount: 850 },
  { from: 6501,  to: 7000,   amount: 900 },
  { from: 7001,  to: 7500,   amount: 950 },
  { from: 7501,  to: 8000,   amount: 1000 },
  { from: 8001,  to: 8500,   amount: 1050 },
  { from: 8501,  to: 9000,   amount: 1100 },
  { from: 9001,  to: 9500,   amount: 1150 },
  { from: 9501,  to: 10000,  amount: 1200 },
] as const;

function lookupCommissionForAmount(amount: number): number {
  for (const b of COMMISSION_BRACKETS) {
    if (amount >= b.from && amount <= b.to) return b.amount;
  }
  return 0;
}

/**
 * GET /api/field-dispatch/:id
 * Returns the dispatch, related waiter & item, optional return,
 * and computed totals if a return exists.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ error: "invalid id" });
    }

    const dispatch = await prisma.fieldDispatch.findUnique({
      where: { id },
      include: { waiter: true, item: true, return: true },
    });

    if (!dispatch) return res.status(404).json({ error: "not found" });

    const qtyDispatched = Number(dispatch.qtyDispatched);
    const priceEach = Number(dispatch.priceEach);
    const grossSales = Number((qtyDispatched * priceEach).toFixed(2));

    if (!dispatch.return) {
      // No return yet: provide base info and gross (for reference)
      return res.json({
        ok: true,
        dispatch,
        computed: {
          qtyDispatched,
          priceEach,
          grossSales,
          hasReturn: false,
        },
      });
    }

    const qRet = Number(dispatch.return.qtyReturned);
    const lQty = Number(dispatch.return.lossQty);
    const soldQty = qtyDispatched - qRet - lQty;
    const soldAmount = Number((soldQty * priceEach).toFixed(2));
    const commission = lookupCommissionForAmount(soldAmount);

    return res.json({
      ok: true,
      dispatch,
      computed: {
        qtyDispatched,
        priceEach,
        grossSales,
        hasReturn: true,
        qtyReturned: qRet,
        lossQty: lQty,
        soldQty,
        soldAmount,
        cashCollected: Number(dispatch.return.cashCollected),
        commission,
      },
    });
  } catch (err: any) {
    console.error("field-dispatch:get error", err);
    return res.status(500).json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
