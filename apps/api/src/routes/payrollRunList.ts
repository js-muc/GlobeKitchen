import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/payroll
 * Query:
 *  - year?: number
 *  - month?: number (1..12)
 *  - page?: number (default 1)
 *  - pageSize?: number (default 20, max 100)
 *  - includeLines?: boolean ("true"|"false", default false)
 *
 * Response:
 * {
 *   ok: true,
 *   page, pageSize, total,
 *   runs: [{
 *     id, periodYear, periodMonth, runAt, createdAt, updatedAt,
 *     lineCount,
 *     totals: { gross, deductionsApplied, carryForward, netPay },
 *     lines?: [{ id, employeeId, gross, deductionsApplied, carryForward, netPay, note, createdAt }]
 *   }]
 * }
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const month = req.query.month ? Number(req.query.month) : undefined;
    if (req.query.year && Number.isNaN(year)) {
      return res.status(400).json({ error: "invalid year" });
    }
    if (req.query.month && (Number.isNaN(month) || month! < 1 || month! > 12)) {
      return res.status(400).json({ error: "invalid month (1..12)" });
    }

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const includeLines =
      String(req.query.includeLines ?? "false").toLowerCase() === "true";

    const where: any = {};
    if (year) where.periodYear = year;
    if (month) where.periodMonth = month;

    // ✅ Always fetch full line fields to avoid union types (TS errors)
    const [runs, total] = await Promise.all([
      prisma.payrollRun.findMany({
        where,
        orderBy: [
          { periodYear: "desc" },
          { periodMonth: "desc" },
          { runAt: "desc" },
        ],
        skip,
        take,
        include: {
          lines: {
            select: {
              id: true,
              employeeId: true,
              gross: true,
              deductionsApplied: true,
              carryForward: true,
              netPay: true,
              note: true,
              createdAt: true,
            },
            orderBy: { id: "asc" },
          },
        },
      }),
      prisma.payrollRun.count({ where }),
    ]);

    const shaped = runs.map((r) => {
      const sums = r.lines.reduce(
        (acc, L) => {
          acc.gross += Number(L.gross);
          acc.deductionsApplied += Number(L.deductionsApplied);
          acc.carryForward += Number(L.carryForward);
          acc.netPay += Number(L.netPay);
          return acc;
        },
        { gross: 0, deductionsApplied: 0, carryForward: 0, netPay: 0 }
      );

      const base = {
        id: r.id,
        periodYear: r.periodYear,
        periodMonth: r.periodMonth,
        runAt: r.runAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        lineCount: r.lines.length,
        totals: {
          gross: Number(sums.gross.toFixed(2)),
          deductionsApplied: Number(sums.deductionsApplied.toFixed(2)),
          carryForward: Number(sums.carryForward.toFixed(2)),
          netPay: Number(sums.netPay.toFixed(2)),
        },
      };

      // ✅ Only attach lines when requested
      if (includeLines) {
        return {
          ...base,
          lines: r.lines.map((L) => ({
            id: L.id,
            employeeId: L.employeeId,
            gross: Number(L.gross),
            deductionsApplied: Number(L.deductionsApplied),
            carryForward: Number(L.carryForward),
            netPay: Number(L.netPay),
            note: L.note,
            createdAt: L.createdAt,
          })),
        };
      }

      return base;
    });

    return res.json({
      ok: true,
      page,
      pageSize,
      total,
      runs: shaped,
    });
  } catch (err: any) {
    console.error("payroll:list error", err);
    return res.status(500).json({
      error: "internal_server_error",
      details: err?.message ?? String(err),
    });
  }
});

export default router;
