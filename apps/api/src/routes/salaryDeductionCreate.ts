import { Router, Request, Response } from "express";
import { PrismaClient, DeductionReason } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

type CreateBody = {
  employeeId: number | string;
  amount: number | string;            // KES; positive
  reason: DeductionReason | string;   // "ADVANCE" | "BREAKAGE" | "LOSS" | "OTHER"
  note?: string;
  date?: string;                      // optional ISO (defaults DB now())
};

function bad(msg: string, details?: unknown) {
  return { error: msg, ...(details ? { details } : {}) };
}

/**
 * POST /api/salary-deductions
 * Body:
 * {
 *   "employeeId": 7,
 *   "amount": "1500.00",
 *   "reason": "ADVANCE",
 *   "note": "Advance for fare",
 *   "date": "2025-10-30T08:15:00.000Z" // optional
 * }
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateBody;

    // Parse/validate input
    const employeeId = Number(body.employeeId);
    const amount = Number(body.amount);
    const reasonRaw = String(body.reason || "").toUpperCase().trim();
    const note = body.note?.trim() || undefined;
    const date = body.date ? new Date(body.date) : undefined;

    if (!employeeId || Number.isNaN(employeeId)) {
      return res.status(400).json(bad("employeeId (number) is required"));
    }
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json(bad("amount must be a number > 0"));
    }
    const allowedReasons = new Set<keyof typeof DeductionReason>([
      "ADVANCE", "BREAKAGE", "LOSS", "OTHER",
    ]);
    if (!allowedReasons.has(reasonRaw as any)) {
      return res.status(400).json(
        bad("reason must be one of ADVANCE | BREAKAGE | LOSS | OTHER", {
          provided: reasonRaw,
        })
      );
    }
    const reason = reasonRaw as DeductionReason;

    // Ensure employee exists
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return res.status(404).json(bad("employee not found"));

    // Create the deduction (atomic)
    const created = await prisma.salaryDeduction.create({
      data: {
        employeeId,
        amount: amount.toFixed(2), // Decimal column: pass string
        reason,
        note: note ?? null,
        // 'date' has default(now()) in schema; only set if provided
        ...(date ? { date } : {}),
        // createdByUserId could be set from auth context later
      },
    });

    return res.status(201).json({ ok: true, deduction: created });
  } catch (err: any) {
    console.error("salary-deductions:create error", err);
    return res.status(500).json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
