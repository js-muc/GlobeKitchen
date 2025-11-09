import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/salary-deductions/:id
 * Returns a single deduction with light employee info.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ error: "invalid id" });
    }

    const d = await prisma.salaryDeduction.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        amount: true,
        reason: true,
        note: true,
        date: true,
        createdAt: true,
        employee: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!d) return res.status(404).json({ error: "not found" });

    return res.json({ ok: true, deduction: d });
  } catch (err: any) {
    console.error("salary-deductions:get error", err);
    return res
      .status(500)
      .json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
