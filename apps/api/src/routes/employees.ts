import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { validateBody } from "../utils/validate.js";
import { zEmployeeCreate, zEmployeeUpdate } from "../schemas/index.js";
import { writeLimiter } from "../middlewares/rateLimit.js";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { moneyStr } from "./_payroll.util.js";

const prisma = new PrismaClient();
const r = Router();

/* ============================================================================
   Dynamic delegates (tolerant to local Prisma type drift)
   - Use index access on `any` to silence TS when models differ across envs.
============================================================================ */
const $ = prisma as any;
const sded = ($["salaryDeduction"] ?? $["deduction"]) as any | undefined;
const pline = ($["payrollLine"] ?? $["payroll_line"]) as any | undefined;

/* ----------------------- Helpers ----------------------- */
function toInt(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getPageParams(q: any) {
  const hasPaging =
    q.page !== undefined || q.pageSize !== undefined || q.limit !== undefined;

  const page = Math.max(1, toInt(q.page ?? 1, 1));
  const rawLimit = q.limit ?? q.pageSize ?? 20; // accept alias in INPUT
  const limit = Math.min(100, Math.max(1, toInt(rawLimit, 20)));

  const skip = (page - 1) * limit;
  const take = limit;

  return { hasPaging, page, limit, skip, take };
}

function pageMeta(total: number, page: number, limit: number) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return {
    total,
    page,
    limit,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}

function coerceTypeAlias(val: unknown): unknown {
  return val === "OUTSIDE" ? "FIELD" : val;
}

function mapTypeAlias(
  req: Parameters<Parameters<typeof r.post>[1]>[0],
  _res: Parameters<Parameters<typeof r.post>[1]>[1],
  next: Parameters<Parameters<typeof r.post>[1]>[2]
) {
  if (req?.body && typeof req.body.type === "string") {
    req.body.type = coerceTypeAlias(req.body.type);
  }
  next();
}

/**
 * IMPORTANT:
 * - `salaryMonthly` is now **legacy** and NOT used for payroll. We keep it stored for history only.
 * - Public GET responses **omit** this field to avoid confusion.
 */
function serializeEmployeePublic(e: any) {
  return {
    id: e.id,
    name: e.name,
    role: e.role,
    type: e.type,
    tableCode: e.tableCode ?? null,
    phone: e.phone ?? null,
    active: e.active,
    createdAt: e.createdAt,
    // salaryMonthly intentionally omitted from public output
  };
}

/** Admin/debug view if needed in the future */
function serializeEmployeeWithLegacy(e: any) {
  return {
    ...serializeEmployeePublic(e),
    salaryMonthly: moneyStr(e.salaryMonthly ?? "0"),
  };
}

function normalizeIncomingSalary(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v.toFixed(2);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toFixed(2);
  }
  return undefined;
}

/* ------------------------ Routes ----------------------- */
r.get("/", async (req, res) => {
  const { hasPaging, page, limit, skip, take } = getPageParams(req.query);

  try {
    // Allow an admin toggle to reveal legacy salary for debugging: ?debugSalary=1
    const revealLegacy = String(req.query.debugSalary ?? "") === "1";

    if (!hasPaging) {
      const rows = await prisma.employee.findMany({ orderBy: { id: "asc" } });
      return res.json(
        rows.map((e) => (revealLegacy ? serializeEmployeeWithLegacy(e) : serializeEmployeePublic(e)))
      );
    }

    const [rows, total] = await Promise.all([
      prisma.employee.findMany({ orderBy: { id: "asc" }, skip, take }),
      prisma.employee.count(),
    ]);

    return res.json({
      data: rows.map((e) => (revealLegacy ? serializeEmployeeWithLegacy(e) : serializeEmployeePublic(e))),
      meta: pageMeta(total, page, limit),
    });
  } catch (e: any) {
    console.error("GET /employees error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_fetch_employees", detail: e?.message });
  }
});

r.post(
  "/",
  requireAuth,
  requireAdmin,
  writeLimiter,
  mapTypeAlias,
  validateBody(zEmployeeCreate),
  async (req, res) => {
    try {
      const {
        name,
        role = "WAITER",
        type = "INSIDE",
        tableCode = null,
        phone = null,
        active = true,
        salaryMonthly, // legacy; stored but ignored by payroll
      } = req.body;

      const normalizedSalary = normalizeIncomingSalary(salaryMonthly);
      const data: any = { name, role, type, tableCode, phone, active };
      if (normalizedSalary !== undefined) data.salaryMonthly = normalizedSalary;

      const row = await prisma.employee.create({ data });
      return res.status(201).json(serializeEmployeePublic(row));
    } catch (e: any) {
      console.error("POST /employees error:", e);
      return res
        .status(500)
        .json({ error: "failed_to_create_employee", detail: e?.message });
    }
  }
);

r.put(
  "/:id",
  requireAuth,
  requireAdmin,
  writeLimiter,
  mapTypeAlias,
  validateBody(zEmployeeUpdate),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, role, type, tableCode, phone, active, salaryMonthly } =
        req.body;

      const normalizedSalary = normalizeIncomingSalary(salaryMonthly);
      const data: any = { name, role, type, tableCode, phone, active };
      // We still persist legacy salary if provided, but payroll ignores it.
      if (normalizedSalary !== undefined) data.salaryMonthly = normalizedSalary;

      const row = await prisma.employee.update({ where: { id }, data });
      return res.json(serializeEmployeePublic(row));
    } catch (e: any) {
      if ((e as any)?.code === "P2025") {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("PUT /employees/:id error:", e);
      return res
        .status(500)
        .json({ error: "failed_to_update_employee", detail: e?.message });
    }
  }
);

/* ============================================================================
   DELETE — always PERMANENT:
   - Transactionally delete dependent rows (PayrollLine & SalaryDeduction/Deduction).
   - Then delete the Employee.
   - Returns 204 No Content on success.
   - 404 if employee not found.
   Notes:
   * All model accesses in the txn are via index on `any` to avoid TS errors.
============================================================================ */
r.delete("/:id", requireAuth, requireAdmin, writeLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });

  try {
    await (prisma as any).$transaction(async (txAny: any) => {
      // Delete payroll lines (supports "payrollLine" or "payroll_line")
      const txPline =
        txAny["payrollLine"] ?? txAny["payroll_line"] ?? undefined;
      if (txPline?.deleteMany) {
        try {
          await txPline.deleteMany({ where: { employeeId: id } });
        } catch (e) {
          console.warn("Delete payroll lines failed (continuing):", e);
        }
      }

      // Delete salary deductions (supports "salaryDeduction" or legacy "deduction")
      const txSded =
        txAny["salaryDeduction"] ?? txAny["deduction"] ?? undefined;
      if (txSded?.deleteMany) {
        try {
          await txSded.deleteMany({ where: { employeeId: id } });
        } catch (e) {
          console.warn("Delete salary deductions failed (continuing):", e);
        }
      }

      // Finally delete employee
      await txAny.employee.delete({ where: { id } });
    });

    return res.status(204).end();
  } catch (e: any) {
    if ((e as any)?.code === "P2025") {
      return res.status(404).json({ error: "not_found" });
    }
    console.error("DELETE /employees/:id error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_delete_employee", detail: e?.message });
  }
});

export default r;

/**
 * @openapi
 * components:
 *   schemas:
 *     Employee:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         name: { type: string, example: "Default Waiter" }
 *         role:
 *           type: string
 *           enum: [WAITER, CHEF, CASHIER, MANAGER, KITCHEN]
 *           example: "WAITER"
 *         type:
 *           type: string
 *           enum: [INSIDE, FIELD, KITCHEN]
 *           example: "FIELD"
 *         tableCode: { type: string, nullable: true, example: null }
 *         phone: { type: string, nullable: true, example: null }
 *         active: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time }
 *       description: >
 *         Public responses intentionally omit salary fields. Payroll is commission-only.
 *     PageMeta:
 *       type: object
 *       properties:
 *         total: { type: integer, example: 1 }
 *         page: { type: integer, example: 1 }
 *         limit: { type: integer, example: 20 }
 *         pages: { type: integer, example: 1 }
 *         hasNext: { type: boolean, example: false }
 *         hasPrev: { type: boolean, example: false }
 */
