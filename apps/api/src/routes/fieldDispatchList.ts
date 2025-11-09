import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

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

function commissionFor(amount: number) {
  for (const b of COMMISSION_BRACKETS) {
    if (amount >= b.from && amount <= b.to) return b.amount;
  }
  return 0;
}

/**
 * GET /api/field-dispatch?date=YYYY-MM-DD&waiterId=3
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { date, waiterId } = req.query;

    if (!date) {
      return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });
    }

    const day = new Date(String(date));
    if (isNaN(day.getTime())) {
      return res.status(400).json({ error: "invalid date format" });
    }

    // Range for the day's entries
    const start = new Date(day);
    start.setHours(0,0,0,0);
    const end = new Date(day);
    end.setHours(23,59,59,999);

    const where: any = {
      date: { gte: start, lte: end }
    };

    if (waiterId) {
      const wid = Number(waiterId);
      if (isNaN(wid)) return res.status(400).json({ error: "waiterId must be a number" });
      where.waiterId = wid;
    }

    const dispatches = await prisma.fieldDispatch.findMany({
      where,
      include: { waiter: true, item: true, return: true },
      orderBy: { id: "desc" }
    });

    const result = dispatches.map(d => {
      const qty = Number(d.qtyDispatched);
      const price = Number(d.priceEach);
      const gross = qty * price;

      if (!d.return) {
        return {
          ...d,
          computed: {
            grossSales: Number(gross.toFixed(2)),
            hasReturn: false
          }
        };
      }

      const qRet = Number(d.return.qtyReturned);
      const lQty = Number(d.return.lossQty);
      const soldQty = qty - qRet - lQty;
      const soldAmount = Number((soldQty * price).toFixed(2));
      const commission = commissionFor(soldAmount);

      return {
        ...d,
        computed: {
          hasReturn: true,
          grossSales: Number(gross.toFixed(2)),
          qtyReturned: qRet,
          lossQty: lQty,
          soldQty,
          soldAmount,
          cashCollected: Number(d.return.cashCollected),
          commission
        }
      };
    });

    return res.json({ ok: true, dispatches: result });

  } catch (err: any) {
    console.error("field-dispatch:list error", err);
    return res.status(500).json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
