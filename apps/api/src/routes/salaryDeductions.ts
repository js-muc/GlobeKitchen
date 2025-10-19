// apps/api/src/routes/salaryDeductions.ts
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { zSalaryDeductionCreate } from "../schemas/payroll.js";
import { getPageParams, pageMeta, moneyStr } from "./_payroll.util.js";

const prisma = new PrismaClient();
const r = Router();

// support both new and legacy model names
function getDeductionDelegate(p: any) {
  const d = p?.salaryDeduction ?? p?.deduction;
  if (!d) {
    throw new Error(
      "No deduction delegate found on PrismaClient (expected prisma.salaryDeduction or prisma.deduction). " +
        "Regenerate Prisma client after updating schema."
    );
  }
  return d as any;
}
const sded = getDeductionDelegate(prisma);

// Use a literal union for reasons; don’t depend on Prisma enum exports
const VALID_REASONS = ["ADVANCE", "BREAKAGE", "LOSS", "OTHER"] as const;
type Reason = (typeof VALID_REASONS)[number];

function serialize(row: any) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: row.date,
    amount: moneyStr(row.amount), // string for FE consistency
    reason: row.reason as Reason,
    note: row.note ?? null,
    meta: row.meta ?? null,
    createdAt: row.createdAt,
    // updatedAt is present in schema but not required in API contract; add if you want:
    // updatedAt: row.updatedAt ?? null,
  };
}

/**
 * @openapi
 * /salary-deductions:
 *   get:
 *     summary: List salary deductions (paged)
 *     tags: [Payroll]
 *     parameters:
 *       - in: query
 *         name: employeeId
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: reason
 *         schema:
 *           type: string
 *           enum: [ADVANCE, BREAKAGE, LOSS, OTHER]
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2025 }
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12, example: 9 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Paged list of deductions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer, example: 1 }
 *                       employeeId: { type: integer, example: 1 }
 *                       date: { type: string, format: date-time }
 *                       amount: { type: string, example: "2500.00" }
 *                       reason:
 *                         type: string
 *                         enum: [ADVANCE, BREAKAGE, LOSS, OTHER]
 *                       note: { type: string, nullable: true }
 *                       meta: { nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     pages: { type: integer }
 *                     hasNext: { type: boolean }
 *                     hasPrev: { type: boolean }
 */
// GET /api/salary-deductions?employeeId=&reason=&year=&month=&page=&limit=
r.get("/", async (req, res) => {
  const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;

  const reasonRaw = (req.query.reason as string | undefined)?.toUpperCase();
  const reason: Reason | undefined = (VALID_REASONS as readonly string[]).includes(String(reasonRaw))
    ? (reasonRaw as Reason)
    : undefined;

  const year = req.query.year ? Number(req.query.year) : undefined;
  const month = req.query.month ? Number(req.query.month) : undefined;

  const where: any = {};
  if (Number.isFinite(employeeId)) where.employeeId = employeeId;
  if (reason) where.reason = reason as any;

  // Month filter (UTC boundaries)
  if (Number.isFinite(year) && Number.isFinite(month) && month! >= 1 && month! <= 12) {
    const start = new Date(Date.UTC(year!, month! - 1, 1));
    const end = new Date(Date.UTC(month === 12 ? year! + 1 : year!, month === 12 ? 0 : month!, 1));
    where.date = { gte: start, lt: end };
  }

  const { page, limit, skip, take } = getPageParams(req.query);
  const [rows, total] = await Promise.all([
    sded.findMany({ where, orderBy: { date: "desc" }, skip, take }),
    sded.count({ where }),
  ]);

  return res.json({ data: rows.map(serialize), meta: pageMeta(total, page, limit) });
});

/**
 * @openapi
 * /salary-deductions:
 *   post:
 *     summary: Create a salary deduction (admin)
 *     tags: [Payroll]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [employeeId, amount, reason]
 *             properties:
 *               employeeId: { type: integer, example: 1 }
 *               date: { type: string, format: date-time, nullable: true, example: "2025-09-24T09:00:37.826Z" }
 *               amount: { type: string, example: "2500.00", description: "Decimal as string" }
 *               reason:
 *                 type: string
 *                 enum: [ADVANCE, BREAKAGE, LOSS, OTHER]
 *               note: { type: string, nullable: true }
 *               meta: { nullable: true }
 *     responses:
 *       201:
 *         description: Created deduction
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: integer }
 *                 employeeId: { type: integer }
 *                 date: { type: string, format: date-time }
 *                 amount: { type: string, example: "2500.00" }
 *                 reason:
 *                   type: string
 *                   enum: [ADVANCE, BREAKAGE, LOSS, OTHER]
 *                 note: { type: string, nullable: true }
 *                 meta: { nullable: true }
 *                 createdAt: { type: string, format: date-time }
 *       400: { description: Employee not found / inactive / validation error }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden (admin required) }
 *       429: { description: Rate limited }
 *       500: { description: Internal error }
 */
// POST /api/salary-deductions  (admin)
r.post(
  "/",
  requireAuth,
  requireAdmin,
  writeLimiter,
  validateBody(zSalaryDeductionCreate),
  async (req, res) => {
    const { employeeId, date, amount, reason, note, meta } = req.body as {
      employeeId: number;
      date?: string | Date;
      amount: string; // Decimal as string (preserved)
      reason: Reason;
      note?: string | null;
      meta?: unknown;
    };

    const emp = await prisma.employee.findUnique({ where: { id: Number(employeeId) } });
    if (!emp) return res.status(400).json({ error: "employee_not_found" });
    if (!emp.active) return res.status(400).json({ error: "employee_inactive" });

    // Build data dynamically so TS/Prisma stays happy even if createdByUserId is absent
    const data: any = {
      employeeId: Number(employeeId),
      date: date ? new Date(date) : new Date(),
      amount: amount as any, // Prisma Decimal-compatible (string)
      reason: reason as any, // enum or string depending on schema
      note: note ?? null,
      meta: meta ?? undefined,
    };

    const userId: number | undefined = (req as any).user?.id;
    if (userId !== undefined && userId !== null) {
      // Will be ignored if column doesn't exist in schema/client
      data.createdByUserId = userId;
    }

    const created = await sded.create({ data });

    return res.status(201).json(serialize(created));
  }
);

export default r;
