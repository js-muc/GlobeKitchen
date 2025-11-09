import { Router, Request, Response } from "express";
import { PrismaClient, DeductionReason } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/salary-deductions
 * Query params:
 *   - employeeId?: number
 *   - reason?: ADVANCE|BREAKAGE|LOSS|OTHER
 *   - from?: YYYY-MM-DD (inclusive, by date field)
 *   - to?:   YYYY-MM-DD (inclusive, by date field)
 *   - page?: number (default 1, min 1)
 *   - pageSize?: number (default 20, min 1, max 100)
 *
 * Sort: date desc, then createdAt desc
 *
 * Response:
 * {
 *   ok: true,
 *   page: number,
 *   pageSize: number,
 *   total: number,
 *   items: Array<{
 *     id, employeeId, amount, reason, note, date, createdAt
 *     employee?: { id, name, phone }
 *   }>
 * }
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // parse query
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
    if (req.query.employeeId && (Number.isNaN(employeeId) || employeeId! <= 0)) {
      return res.status(400).json({ error: "employeeId must be a positive number" });
    }

    const reasonRaw = req.query.reason ? String(req.query.reason).toUpperCase().trim() : undefined;
    if (reasonRaw && !["ADVANCE", "BREAKAGE", "LOSS", "OTHER"].includes(reasonRaw)) {
      return res.status(400).json({ error: "reason must be ADVANCE|BREAKAGE|LOSS|OTHER" });
    }
    const reason = reasonRaw as DeductionReason | undefined;

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // date range (by 'date' column)
    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    if (req.query.from) {
      const d = new Date(String(req.query.from));
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "invalid 'from' date" });
      d.setHours(0, 0, 0, 0);
      fromDate = d;
    }
    if (req.query.to) {
      const d = new Date(String(req.query.to));
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "invalid 'to' date" });
      d.setHours(23, 59, 59, 999);
      toDate = d;
    }

    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (reason) where.reason = reason;
    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date.gte = fromDate;
      if (toDate) where.date.lte = toDate;
    }

    // run in parallel
    const [items, total] = await Promise.all([
      prisma.salaryDeduction.findMany({
        where,
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
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      prisma.salaryDeduction.count({ where }),
    ]);

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      items,
    });
  } catch (err: any) {
    console.error("salary-deductions:list error", err);
    return res.status(500).json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
