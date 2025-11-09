import { Router, Request, Response } from "express";
import { PrismaClient, EmployeeType } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

type CreateBody = {
  waiterId: number | string;   // employeeId in your schema (relation name is waiter)
  itemId: number | string;
  qtyDispatched: number | string;
  priceEach: number | string;
  date?: string;               // optional ISO string
};

function bad(msg: string, details?: unknown) {
  return { error: msg, ...(details ? { details } : {}) };
}

/**
 * POST /api/field-dispatch
 * Body:
 * {
 *   waiterId: 3,
 *   itemId: 12,
 *   qtyDispatched: "10.00",
 *   priceEach: "50.00",
 *   date: "2025-10-30T06:00:00.000Z" // optional; server will use now() if omitted
 * }
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateBody;

    const waiterId = Number(body.waiterId);
    const itemId = Number(body.itemId);
    const qtyDispatched = Number(body.qtyDispatched);
    const priceEach = Number(body.priceEach);
    // ✅ Always provide a Date (Prisma type is string | Date, not undefined)
    const date: Date = body.date ? new Date(body.date) : new Date();

    // Basic validations
    if (!waiterId || Number.isNaN(waiterId)) {
      return res.status(400).json(bad("waiterId (number) is required"));
    }
    if (!itemId || Number.isNaN(itemId)) {
      return res.status(400).json(bad("itemId (number) is required"));
    }
    if (Number.isNaN(qtyDispatched) || qtyDispatched <= 0) {
      return res.status(400).json(bad("qtyDispatched must be a number > 0"));
    }
    if (Number.isNaN(priceEach) || priceEach < 0) {
      return res.status(400).json(bad("priceEach must be a number ≥ 0"));
    }

    // Ensure waiter exists and is FIELD (enforce field logic)
    const waiter = await prisma.employee.findUnique({ where: { id: waiterId } });
    if (!waiter) return res.status(404).json(bad("waiter not found"));
    if (waiter.type !== EmployeeType.FIELD) {
      return res.status(400).json(bad("employee is not a FIELD worker", { employeeId: waiterId, type: waiter.type }));
    }

    // Ensure item exists
    const item = await prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!item) return res.status(404).json(bad("menu item not found"));

    // Create the dispatch (single item per dispatch as per current schema)
    const dispatch = await prisma.fieldDispatch.create({
      data: {
        waiterId,
        itemId,
        qtyDispatched: qtyDispatched.toString(), // Decimal columns prefer string
        priceEach: priceEach.toString(),
        date, // ✅ now guaranteed to be a Date
      },
      include: {
        waiter: true,
        item: true,
        return: true, // will be null
      },
    });

    return res.status(201).json({ ok: true, dispatch });
  } catch (err: any) {
    console.error("field-dispatch:create error", err);
    return res.status(500).json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
