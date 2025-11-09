import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Commission brackets (fixed amounts), exactly as provided
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

type ReturnBody = {
  qtyReturned: number | string;
  lossQty?: number | string;
  cashCollected: number | string;
  note?: string;
};

/**
 * POST /api/field-dispatch/:id/return
 * Body:
 * {
 *   qtyReturned: "2.00",
 *   lossQty: "0.00",
 *   cashCollected: "150.00",
 *   note: "optional"
 * }
 */
router.post('/:id/return', async (req: Request, res: Response) => {
  try {
    const dispatchId = Number(req.params.id);
    if (!dispatchId || Number.isNaN(dispatchId)) {
      return res.status(400).json({ error: 'invalid dispatch id' });
    }

    const body = req.body as ReturnBody;
    const qRet = Number(body.qtyReturned);
    const lQty = Number(body.lossQty ?? 0);
    const cash = Number(body.cashCollected);
    const note = body.note ?? null;

    if (Number.isNaN(qRet) || qRet < 0) {
      return res.status(400).json({ error: 'qtyReturned must be a non-negative number' });
    }
    if (Number.isNaN(lQty) || lQty < 0) {
      return res.status(400).json({ error: 'lossQty must be a non-negative number' });
    }
    if (Number.isNaN(cash) || cash < 0) {
      return res.status(400).json({ error: 'cashCollected must be a non-negative number' });
    }

    const dispatch = await prisma.fieldDispatch.findUnique({
      where: { id: dispatchId },
      include: { waiter: true, item: true, return: true },
    });

    if (!dispatch) {
      return res.status(404).json({ error: 'dispatch not found' });
    }

    // Prevent duplicate returns (unique dispatchId on FieldReturn)
    if (dispatch.return) {
      return res.status(400).json({ error: 'dispatch already has a return recorded' });
    }

    const qtyDispatched = Number(dispatch.qtyDispatched);
    const priceEach = Number(dispatch.priceEach);

    if (qRet + lQty > qtyDispatched) {
      return res.status(400).json({
        error: 'qtyReturned + lossQty cannot exceed qtyDispatched',
        details: { qtyDispatched, qtyReturned: qRet, lossQty: lQty },
      });
    }

    const grossSales = qtyDispatched * priceEach;
    const soldQty = qtyDispatched - qRet - lQty;
    const soldAmount = Number((soldQty * priceEach).toFixed(2));

    if (cash > soldAmount) {
      return res.status(400).json({
        error: 'cashCollected cannot exceed sold amount',
        details: { soldQty, soldAmount, cashCollected: cash },
      });
    }

    // Atomic creation of FieldReturn
    const fieldReturn = await prisma.$transaction(async (tx) => {
      return tx.fieldReturn.create({
        data: {
          dispatchId,
          qtyReturned: qRet.toString(),
          lossQty: lQty.toString(),
          cashCollected: cash.toString(),
          note,
        },
      });
    });

    const commission = lookupCommissionForAmount(soldAmount);

    return res.status(201).json({
      ok: true,
      fieldReturn,
      computed: {
        qtyDispatched,
        priceEach,
        grossSales: Number(grossSales.toFixed(2)),
        qtyReturned: qRet,
        lossQty: lQty,
        soldQty,
        soldAmount,
        cashCollected: cash,
        commission,
      },
    });
  } catch (err: any) {
    console.error('field-dispatch:return error', err);
    return res.status(500).json({ error: 'internal_server_error', details: err?.message ?? String(err) });
  }
});

export default router;
