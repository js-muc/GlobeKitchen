// apps/api/src/routes/dailySales.ts
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { writeLimiter } from "../middlewares/rateLimit.js";

const prisma = new PrismaClient();
const r = Router();

/**
 * NOTE: keep Prisma model access via shims to avoid host/editor version drift.
 */
const shiftModel: any = (prisma as any).shift;
const saleLineModel: any = (prisma as any).saleLine;
const shiftCashupModel: any = (prisma as any).shiftCashup; // optional (exists if you have a table)
const employeeModel: any = (prisma as any).employee;

/** ---------- Zod schemas ---------- */
const zOpenShift = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  employeeId: z.number().int().positive(),
  waiterType: z.enum(["INSIDE", "FIELD"]),
  tableCode: z.string().trim().min(1).optional(), // INSIDE optional
  openingFloat: z.number().nonnegative().optional(),
  route: z.string().trim().optional(), // FIELD optional
  notes: z.string().trim().optional(),
});

const zIdParam = z.object({
  id: z.coerce.number().int().positive(),
});

/** ---------- Date helpers (Nairobi business day) ---------- */
/** Convert YYYY-MM-DD to UTC midnight Date (no timezone drift) */
function dateOnlyToUtc(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
}

/** Today as Nairobi calendar day "YYYY-MM-DD" */
function ymdTodayNairobi(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** ---------- Small helpers (non-persisted compute) ---------- */
async function computeCashExpected(shiftId: number): Promise<number> {
  const lines: Array<{ qty: number; unitPrice: number }> = await saleLineModel.findMany({
    where: { shiftId },
    select: { qty: true, unitPrice: true },
  });
  let expected = 0;
  for (const l of lines) {
    const q = Number(l.qty) || 0;
    const p = Number(l.unitPrice) || 0;
    expected += q * p;
  }
  return Number(expected.toFixed(2));
}

async function buildSummary(shiftId: number) {
  const lines: Array<{ itemId: number; unit: string | null; qty: number; unitPrice: number }> =
    await saleLineModel.findMany({
      where: { shiftId },
      select: { itemId: true, unit: true, qty: true, unitPrice: true },
    });

  type Row = {
    itemId: number;
    unit: string;
    price: number;
    issued: number;
    added: number;
    returned: number;
    sold: number;
    remaining: number;
    cashDue: number;
  };

  const by = new Map<number, Row>();
  for (const l of lines) {
    const id = Number(l.itemId);
    const unit = (l.unit ?? "").toString();
    const price = Number(l.unitPrice) || 0;
    const qty = Number(l.qty) || 0;

    const cur =
      by.get(id) ??
      ({
        itemId: id,
        unit,
        price,
        issued: 0,
        added: 0,
        returned: 0,
        sold: 0,
        remaining: 0,
        cashDue: 0,
      } as Row);

    cur.sold += qty;
    cur.cashDue += qty * price;
    by.set(id, cur);
  }

  const byItem = Array.from(by.values()).map((r) => ({
    ...r,
    price: Number(r.price.toFixed(2)),
    cashDue: Number(r.cashDue.toFixed(2)),
  }));

  const totals = {
    cashDue: Number(byItem.reduce((s, r) => s + (r.cashDue || 0), 0).toFixed(2)),
    lines: lines.length,
  };

  return { byItem, totals };
}

/** Latest cashup meta for a shift (nullable) */
async function getLatestCashupMeta(shiftId: number) {
  if (!shiftCashupModel?.findFirst) return null;
  const row = await shiftCashupModel.findFirst({
    where: { shiftId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
  return row ? { id: row.id, createdAt: row.createdAt } : null;
}

/** ---------- Routes ---------- */

/**
 * LIST shifts (for History)
 * GET /api/daily-sales/shifts?dateFrom=&dateTo=&status=&employeeId=&page=&limit=
 */
const zListQuery = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

r.get("/shifts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const q = zListQuery.safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ error: "invalid_query", detail: q.error.flatten() });
    }
    const { dateFrom, dateTo, status, employeeId, page, limit } = q.data;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (status === "OPEN") where.closedAt = null;
    if (status === "CLOSED") where.closedAt = { not: null };
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = dateOnlyToUtc(dateFrom);
      if (dateTo) {
        const to = dateOnlyToUtc(dateTo);
        where.date.lte = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
      }
    }

    const [rows, total] = await Promise.all([
      shiftModel.findMany({
        where,
        orderBy: [{ date: "desc" }, { openedAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          date: true,
          employeeId: true,
          waiterType: true,
          openedAt: true,
          closedAt: true,
          grossSales: true,
          netSales: true,
          cashRemit: true,
          notes: true,
        },
      }),
      shiftModel.count({ where }),
    ]);

    return res.json({
      data: rows,
      meta: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil((total || 0) / (limit || 1))),
      },
    });
  } catch (e: any) {
    console.error("GET /daily-sales/shifts error:", e);
    return res.status(500).json({ error: "failed_to_list_shifts", detail: e?.message });
  }
});

/**
 * GET /api/daily-sales/shifts/:id
 */
r.get("/shifts/:id(\\d+)", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = zIdParam.safeParse(req.params);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "invalid_id", detail: parsed.error.flatten() });
    }
    const { id } = parsed.data;

    const shift = await shiftModel.findUnique({ where: { id } });
    if (!shift) return res.status(404).json({ error: "not_found", id });

    return res.json({ ok: true, shift });
  } catch (e: any) {
    console.error("GET /daily-sales/shifts/:id error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_fetch_shift", detail: e?.message });
  }
});

/**
 * POST /api/daily-sales/shifts/open
 * (unchanged logic)
 */
r.post(
  "/shifts/open",
  requireAuth,
  requireAdmin,
  writeLimiter,
  async (req, res) => {
    try {
      const parsed = zOpenShift.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "invalid_input", detail: parsed.error.flatten() });
      }
      const {
        date, employeeId, waiterType, tableCode, openingFloat, route, notes,
      } = parsed.data;

      const day = dateOnlyToUtc(date);
      const now = new Date();

      // Idempotent open
      const existing = await shiftModel.findFirst({
        where: { date: day, employeeId, waiterType: waiterType as any, closedAt: null },
      });
      if (existing) return res.json({ ok: true, shift: existing });

      const shift = await shiftModel.create({
        data: {
          date: day,
          employeeId,
          waiterType: waiterType as any,
          openedAt: now,
          openingFloat: openingFloat != null ? openingFloat : null,
          notes: notes ?? null,
          tableCode: waiterType === "INSIDE" ? tableCode ?? null : null,
          route: waiterType === "FIELD" ? route ?? null : null,
        },
      });

      return res.status(201).json({ ok: true, shift });
    } catch (e: any) {
      console.error("POST /daily-sales/shifts/open error:", e);
      return res
        .status(500)
        .json({ error: "failed_to_open_shift", detail: e?.message });
    }
  }
);

/** ✅ Allow decimal qty to match Prisma Decimal(12,2) */
const zAddSaleLine = z.object({
  shiftId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  qty: z.number().positive(), // was .int().positive()
  unitPrice: z.number().nonnegative(),
  unit: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

/**
 * POST /api/daily-sales/lines
 * Preserves original behavior, but if the shift is CLOSED:
 *  - If NO cashup exists for that shift → REOPEN it (notes annotated), then add line.
 *  - If cashup exists → OPEN a NEW shift for same day/employee/waiterType, then add line.
 * Always returns { ok, line, shift } where `shift` is the one actually used.
 */
r.post("/lines", requireAuth, requireAdmin, writeLimiter, async (req, res) => {
  try {
    const parsed = zAddSaleLine.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "invalid_input", detail: parsed.error.flatten() });
    }
    const { shiftId, itemId, qty, unitPrice, unit, note } = parsed.data;

    let shift = await shiftModel.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: "shift_not_found" });

    // If the shift is closed, handle reopen-first-or-create-new
    if (shift.closedAt) {
      // Is there a cashup row for this shift?
      const hasCashup =
        !!(await shiftCashupModel?.findFirst?.({
          where: { shiftId: shift.id },
          select: { id: true },
        }));

      if (!hasCashup) {
        // Reopen the same shift
        const marker = `\n\n[REOPEN:${new Date().toISOString()}] ${JSON.stringify({
          prevClosedAt: shift.closedAt,
          reassignedTo: shift.employeeId,
        })}`;
        shift = await shiftModel.update({
          where: { id: shift.id },
          data: { closedAt: null, notes: (shift.notes ?? "") + marker },
        });
      } else {
        // Start a fresh shift for the same day/employee/waiterType
        const now = new Date();
        const fresh = await shiftModel.create({
          data: {
            date: shift.date,
            employeeId: shift.employeeId,
            waiterType: shift.waiterType,
            openedAt: now,
            openingFloat: null,
            tableCode: shift.tableCode ?? null,
            route: shift.route ?? null,
            notes: (shift.notes ?? "") + `\n\n[NEW_AFTER_CASHUP:${now.toISOString()}]`,
          },
        });
        shift = fresh;
      }
    }

    const total = Number((qty * unitPrice).toFixed(2));

    const line = await saleLineModel.create({
      data: {
        shiftId: shift.id,
        itemId,
        qty,
        unitPrice,
        unit: unit ?? "unit",
        note: note ?? null,
        total,
        date: shift.date,
      },
    });

    await shiftModel.update({
      where: { id: shift.id },
      data: {
        grossSales: { increment: total },
        netSales: { increment: total },
      },
    });

    // IMPORTANT: return the active shift so FE can switch state
    return res.status(201).json({ ok: true, line, shift });
  } catch (e: any) {
    console.error("POST /daily-sales/lines error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_add_sale_line", detail: e?.message });
  }
});

/**
 * GET /api/daily-sales/shifts/:id/lines
 * (unchanged)
 */
const zListLinesParams = z.object({ id: z.coerce.number().int().positive() });

function pageMeta(total: number, page: number, limit: number) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return { total, page, limit, pages, hasNext: page < pages, hasPrev: page > 1 };
}

r.get("/shifts/:id(\\d+)/lines", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = zListLinesParams.safeParse(req.params);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "invalid_id", detail: parsed.error.flatten() });
    }
    const { id: shiftId } = parsed.data;

    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const skip = (page - 1) * limit;

    const shift = await shiftModel.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: "shift_not_found" });

    const [rows, total] = await Promise.all([
      saleLineModel.findMany({
        where: { shiftId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      saleLineModel.count({ where: { shiftId } }),
    ]);

    return res.json({ data: rows, meta: pageMeta(total, page, limit) });
  } catch (e: any) {
    console.error("GET /daily-sales/shifts/:id/lines error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_list_lines", detail: e?.message });
  }
});

/**
 * POST /api/daily-sales/shifts/:id/close
 * (unchanged behavior: 400 if already closed)
 */
const zCloseShiftParams = z.object({ id: z.coerce.number().int().positive() });
const zCloseShiftBody = z.object({
  cashRemit: z.number().nonnegative().optional(),
  notes: z.string().trim().optional(),
});

r.post("/shifts/:id(\\d+)/close", requireAuth, requireAdmin, writeLimiter, async (req, res) => {
  try {
    const p = zCloseShiftParams.safeParse(req.params);
    if (!p.success) {
      return res.status(400).json({ error: "invalid_id", detail: p.error.flatten() });
    }
    const b = zCloseShiftBody.safeParse(req.body ?? {});
    if (!b.success) {
      return res.status(400).json({ error: "invalid_input", detail: b.error.flatten() });
    }

    const shiftId = p.data.id;
    const { cashRemit, notes } = b.data;

    const shift = await shiftModel.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: "shift_not_found" });
    if (shift.closedAt) return res.status(400).json({ error: "already_closed" });

    const updated = await shiftModel.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        ...(cashRemit != null ? { cashRemit } : {}),
        ...(notes ? { notes } : {}),
      },
    });

    return res.json({ ok: true, shift: updated });
  } catch (e: any) {
    // Before validation, at the top of the handler body:


    console.error("POST /daily-sales/shifts/:id/close error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_close_shift", detail: e?.message });
  }
});

/**
 * GET /api/daily-sales/shifts/:id/summary
 * (server-side derivation; used by FE and by cashup)
 */
r.get("/shifts/:id(\\d+)/summary", requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = zIdParam.safeParse(req.params);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "invalid_id", detail: parsed.error.flatten() });
    }
    const { id: shiftId } = parsed.data;

    const shift = await shiftModel.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: "shift_not_found" });

    const summary = await buildSummary(shiftId);
    return res.json(summary);
  } catch (e: any) {
    console.error("GET /daily-sales/shifts/:id/summary error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_build_summary", detail: e?.message });
  }
});

/**
 * PERSIST CASH-UP SNAPSHOT  (Option A: create-or-update)
 * POST /api/daily-sales/shifts/:id/cashup
 * Body: { submittedBy?: number|string, note?: string }
 * - Computes summary on the fly
 * - Saves immutable snapshot (ShiftCashup if available; otherwise append JSON into notes)
 */
const zCashupBody = z.object({
  submittedBy: z.union([z.number(), z.string()]).optional(),
  note: z.string().max(500).optional(),
});

r.post("/shifts/:id(\\d+)/cashup", requireAuth, requireAdmin, writeLimiter, async (req, res) => {
  try {
    const p = zIdParam.safeParse(req.params);
    if (!p.success) {
      return res.status(400).json({ error: "invalid_id", detail: p.error.flatten() });
    }
    const b = zCashupBody.safeParse(req.body ?? {});
    if (!b.success) {
      return res.status(400).json({ error: "invalid_input", detail: b.error.flatten() });
    }
    const { id: shiftId } = p.data;
    const { submittedBy, note } = b.data;

    const shift = await shiftModel.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: "shift_not_found" });

    const summary = await buildSummary(shiftId);
    const payload = {
      meta: {
        shiftId,
        date: shift.date,
        employeeId: shift.employeeId,
        waiterType: shift.waiterType,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        createdAt: new Date().toISOString(),
        submittedBy: submittedBy ?? null,
        note: note ?? null,
        version: 1,
      },
      summary,
    };

    // Preferred: ShiftCashup table exists → create or update the one row per shift
    if (shiftCashupModel?.create) {
      const data = {
        shiftId,
        snapshot: payload, // JSONB recommended in schema
        note: note ?? null,
        submittedBy: submittedBy?.toString?.() ?? null,
      };

      let saved: any;
      try {
        // First attempt: create (works for first-time snapshot)
        saved = await shiftCashupModel.create({ data });
        return res.status(201).json({ ok: true, cashupId: saved.id, cashup: saved });
      } catch (e: any) {
        const msg = String(e?.message || "");
        // If row already exists for this shift, update it (Option A)
        if (msg.includes("Unique constraint failed") || msg.includes("P2002")) {
          saved = await shiftCashupModel.update({
            where: { shiftId },
            data,
          });
          return res.status(200).json({ ok: true, cashupId: saved.id, cashup: saved, updated: true });
        }
        throw e;
      }
    }

    // Fallback: append to notes as JSON (non-breaking; auditable)
    const marker = `\n\n[CASHUP:${new Date().toISOString()}] ${JSON.stringify(payload)}`;
    const updated = await shiftModel.update({
      where: { id: shiftId },
      data: { notes: (shift.notes ?? "") + marker },
      select: { id: true, notes: true },
    });

    return res.status(201).json({ ok: true, cashup: payload, storedIn: "shift.notes", shift: updated });
  } catch (e: any) {
    console.error("POST /daily-sales/shifts/:id/cashup error:", e);
    return res.status(500).json({ error: "failed_to_save_cashup", detail: e?.message });
  }
});

/** -------- READ: latest cash-up snapshot (viewer) --------
 * GET /api/daily-sales/shifts/:id/cashup
 * - If ShiftCashup table exists: returns latest row (one-per-shift or latest)
 * - Else: parses snapshots from shift.notes markers
 */
r.get("/shifts/:id(\\d+)/cashup", requireAuth, requireAdmin, async (req, res) => {
  try {
    const p = zIdParam.safeParse(req.params);
    if (!p.success) {
      return res.status(400).json({ error: "invalid_id", detail: p.error.flatten() });
    }
    const shiftId = p.data.id;

    const shift = await shiftModel.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: "shift_not_found" });

    if (shiftCashupModel?.findUnique || shiftCashupModel?.findFirst) {
      // one-per-shift design (unique shiftId) OR fallback to latest
      const cashup =
        (await shiftCashupModel.findUnique?.({ where: { shiftId } })) ??
        (await shiftCashupModel.findFirst?.({
          where: { shiftId },
          orderBy: { createdAt: "desc" },
        }));
      if (!cashup) return res.status(404).json({ error: "cashup_not_found" });
      return res.json({
        snapshot: cashup.snapshot,
        note: cashup.note ?? null,
        submittedBy: cashup.submittedBy ?? null,
        createdAt: cashup.createdAt,
      });
    }

    // Fallback: parse [CASHUP:...] blocks from notes
    const notes = String(shift.notes ?? "");
    const re = /\[CASHUP:([^\]]+)\]\s+(\{[\s\S]*?\})(?=\s*\n|\s*$)/g;
    const snapshots: Array<{ at: string; payload: any }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(notes)) !== null) {
      const at = m[1];
      try {
        const payload = JSON.parse(m[2]);
        snapshots.push({ at, payload });
      } catch {
        // ignore malformed JSON
      }
    }
    if (!snapshots.length) return res.status(404).json({ error: "cashup_not_found" });
    const latest = snapshots[snapshots.length - 1];
    return res.json({ snapshot: latest.payload, createdAt: latest.at, note: latest.payload?.meta?.note ?? null, submittedBy: latest.payload?.meta?.submittedBy ?? null });
  } catch (e: any) {
    console.error("GET /daily-sales/shifts/:id/cashup error:", e);
    return res.status(500).json({ error: "failed_to_read_cashup", detail: e?.message });
  }
});

/** -------- GET /shifts/for-employee -------- */
const zShiftForEmployeeQuery = z.object({
  name: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  waiterType: z.enum(["INSIDE", "FIELD"]),
});

r.get("/shifts/for-employee", requireAuth, requireAdmin, async (req, res) => {
  try {
    const q = zShiftForEmployeeQuery.safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ error: "invalid_query", detail: q.error.flatten() });
    }
    const { name, waiterType } = q.data;
    const dateStr = q.data.date ?? ymdTodayNairobi();
    const day = dateOnlyToUtc(dateStr);

    const candidates = await employeeModel.findMany({
      where: { name: { contains: name, mode: "insensitive" } },
      select: { id: true, name: true },
      take: 5,
    });

    if (!candidates.length) {
      return res.status(404).json({ error: "employee_not_found", name });
    }
    if (candidates.length > 1) {
      return res.status(409).json({ error: "multiple_employees", candidates });
    }
    const employee = candidates[0];

    const openShift = await shiftModel.findFirst({
      where: { date: day, employeeId: employee.id, waiterType: waiterType as any, closedAt: null },
    });
    if (openShift) return res.json({ ok: true, found: "open", employee, shift: openShift });

    const previousClosed = await shiftModel.findFirst({
      where: {
        employeeId: employee.id,
        waiterType: waiterType as any,
        closedAt: { not: null },
        date: { lte: day },
      },
      orderBy: [{ date: "desc" }, { closedAt: "desc" }, { id: "desc" }],
    });

    if (previousClosed) {
      return res.json({ ok: true, found: "previous_closed", employee, shift: previousClosed });
    }

    return res.json({ ok: true, found: "none", employee });
  } catch (e: any) {
    console.error("GET /daily-sales/shifts/for-employee error:", e);
    return res.status(500).json({ error: "failed_to_resolve_employee_shift", detail: e?.message });
  }
});

/** -------- POST /shifts/:id/reopen -------- */
const zReopenParams = z.object({ id: z.coerce.number().int().positive() });
const zReopenBody   = z.object({ employeeId: z.coerce.number().int().positive().optional() });

r.post("/shifts/:id(\\d+)/reopen", requireAuth, requireAdmin, writeLimiter, async (req, res) => {
  try {
    const p = zReopenParams.safeParse(req.params);
    if (!p.success) return res.status(400).json({ error: "invalid_id", detail: p.error.flatten() });
    const b = zReopenBody.safeParse(req.body ?? {});
    if (!b.success) return res.status(400).json({ error: "invalid_input", detail: b.error.flatten() });

    const shiftId    = p.data.id;
    const employeeId = b.data.employeeId;

    const shift = await shiftModel.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: "shift_not_found" });

    if (!shift.closedAt) {
      // already open
      return res.json({ ok: true, alreadyOpen: true, shift });
    }

    const marker = `\n\n[REOPEN:${new Date().toISOString()}] ${JSON.stringify({
      prevClosedAt: shift.closedAt,
      reassignedTo: employeeId ?? shift.employeeId,
    })}`;

    const updated = await shiftModel.update({
      where: { id: shiftId },
      data: {
        closedAt: null,
        ...(employeeId ? { employeeId } : {}),
        notes: (shift.notes ?? "") + marker,
      },
    });

    return res.json({ ok: true, shift: updated });
  } catch (e: any) {
    console.error("POST /daily-sales/shifts/:id/reopen error:", e);
    return res.status(500).json({ error: "failed_to_reopen_shift", detail: e?.message });
  }
});

/** -------- PATCH /shifts/:id/cashier -------- */
const zCashierParams = z.object({ id: z.coerce.number().int().positive() });
const zCashierBody   = z.object({
  cashierId:   z.union([z.number(), z.string()]).optional(),
  cashierName: z.string().max(120).optional(),
  note:        z.string().max(500).optional(),
});

r.patch("/shifts/:id(\\d+)/cashier", requireAuth, requireAdmin, writeLimiter, async (req, res) => {
  try {
    const p = zCashierParams.safeParse(req.params);
    if (!p.success) return res.status(400).json({ error: "invalid_id", detail: p.error.flatten() });

    const b = zCashierBody.safeParse(req.body ?? {});
    if (!b.success) return res.status(400).json({ error: "invalid_input", detail: b.error.flatten() });

    const shiftId = p.data.id;
    const shift   = await shiftModel.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: "shift_not_found" });

    const marker = `\n\n[CASHIER:${new Date().toISOString()}] ${JSON.stringify({
      cashierId: b.data.cashierId ?? null,
      cashierName: b.data.cashierName ?? null,
      note: b.data.note ?? null,
    })}`;

    const updated = await shiftModel.update({
      where: { id: shiftId },
      data: { notes: (shift.notes ?? "") + marker },
      select: { id: true, notes: true, employeeId: true, closedAt: true },
    });

    return res.json({ ok: true, shift: updated });
  } catch (e: any) {
    console.error("PATCH /daily-sales/shifts/:id/cashier error:", e);
    return res.status(500).json({ error: "failed_to_save_cashier", detail: e?.message });
  }
});

/** ---------- UI helper: POST /shifts/for-employee/reopen ---------- */
const zReopenForEmployeeBody = z.object({
  name: z.string().min(1),
  waiterType: z.enum(["INSIDE", "FIELD"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

r.post("/shifts/for-employee/reopen", requireAuth, requireAdmin, writeLimiter, async (req, res) => {
  try {
    const parsed = zReopenForEmployeeBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", detail: parsed.error.flatten() });
    }

    const { name, waiterType } = parsed.data;
    const dateStr = parsed.data.date ?? ymdTodayNairobi();
    const day = dateOnlyToUtc(dateStr);

    // resolve employee (unique by name)
    const matches = await employeeModel.findMany({
      where: { name: { contains: name, mode: "insensitive" } },
      select: { id: true, name: true },
      take: 5,
    });

    if (!matches.length) return res.status(404).json({ error: "employee_not_found", name });
    if (matches.length > 1) return res.status(409).json({ error: "multiple_employees", candidates: matches });

    const employee = matches[0];

    // 1) If open → return
    const openShift = await shiftModel.findFirst({
      where: { date: day, employeeId: employee.id, waiterType: waiterType as any, closedAt: null },
    });
    if (openShift) {
      return res.json({ ok: true, alreadyOpen: true, employee, shift: openShift });
    }

    // 2) find latest closed for the day (strict same day)
    const previousClosed = await shiftModel.findFirst({
      where: {
        employeeId: employee.id,
        waiterType: waiterType as any,
        closedAt: { not: null },
        date: day,
      },
      orderBy: [{ closedAt: "desc" }, { id: "desc" }],
    });

    if (!previousClosed) {
      return res.status(404).json({ error: "not_found_for_date", employee, date: dateStr });
    }

    // 3) reopen it (and annotate notes)
    const marker = `\n\n[REOPEN:${new Date().toISOString()}] ${JSON.stringify({
      prevClosedAt: previousClosed.closedAt,
      reassignedTo: employee.id,
    })}`;

    const reopened = await shiftModel.update({
      where: { id: previousClosed.id },
      data: { closedAt: null, employeeId: employee.id, notes: (previousClosed.notes ?? "") + marker },
    });

    return res.json({ ok: true, employee, shift: reopened, reopened: true });
  } catch (e: any) {
    console.error("POST /daily-sales/shifts/for-employee/reopen error:", e);
    return res.status(500).json({ error: "failed_to_reopen_for_employee", detail: e?.message });
  }
});

/** -------- NEW: Daily rollup across all shifts (cashier/day-end) --------
 * GET /api/daily-sales/summary/daily?date=YYYY-MM-DD
 * Response shape matches /shifts/:id/summary
 */
const zDailyQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

r.get("/summary/daily", requireAuth, requireAdmin, async (req, res) => {
  try {
    const q = zDailyQuery.safeParse({ date: (req.query.date as string | undefined) ?? ymdTodayNairobi() });
    if (!q.success) {
      return res.status(400).json({ error: "invalid_query", detail: q.error.flatten() });
    }
    const day = dateOnlyToUtc(q.data.date);
    const end = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);

    const lines: Array<{ itemId: number; unit: string | null; qty: number; unitPrice: number }> =
      await saleLineModel.findMany({
        where: { date: { gte: day, lte: end } },
        select: { itemId: true, unit: true, qty: true, unitPrice: true },
      });

    type Row = {
      itemId: number;
      unit: string;
      price: number;
      sold: number;
      cashDue: number;
      issued: number;
      added: number;
      returned: number;
      remaining: number;
    };

    const by = new Map<number, Row>();
    for (const l of lines) {
      const id = Number(l.itemId);
      const unit = (l.unit ?? "").toString();
      const price = Number(l.unitPrice) || 0;
      const qty = Number(l.qty) || 0;

      const cur =
        by.get(id) ??
        ({
          itemId: id,
          unit,
          price,
          sold: 0,
          cashDue: 0,
          issued: 0,
          added: 0,
          returned: 0,
          remaining: 0,
        } as Row);

      cur.sold += qty;
      cur.cashDue += qty * price;
      by.set(id, cur);
    }

    const byItem = Array.from(by.values()).map((r) => ({
      ...r,
      price: Number(r.price.toFixed(2)),
      cashDue: Number(r.cashDue.toFixed(2)),
    }));

    const totals = {
      cashDue: Number(byItem.reduce((s, r) => s + (r.cashDue || 0), 0).toFixed(2)),
      lines: lines.length,
    };

    return res.json({ byItem, totals });
  } catch (e: any) {
    console.error("GET /daily-sales/summary/daily error:", e);
    return res.status(500).json({ error: "failed_to_build_daily_summary", detail: e?.message });
  }
});

/** -------- READ: list cashups (by date/employee), paged --------
 * GET /api/daily-sales/cashups?date=&employeeId=&page=&limit=
 */
const zListCashupsQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

r.get("/cashups", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!shiftCashupModel?.findMany) {
      return res.status(501).json({ error: "cashup_store_unavailable" });
    }
    const q = zListCashupsQuery.safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ error: "invalid_query", detail: q.error.flatten() });
    }
    const { date, employeeId, page, limit } = q.data;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (date || employeeId) {
      // join via shift relation on ShiftCashup
      where.shift = {};
      if (date) {
        const day = dateOnlyToUtc(date);
        where.shift.date = {
          gte: day,
          lte: new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1),
        };
      }
      if (employeeId) where.shift.employeeId = employeeId;
    }

    const [rows, total] = await Promise.all([
      shiftCashupModel.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          shiftId: true,
          createdAt: true,
          submittedBy: true,
          note: true,
          snapshot: true,
          shift: {
            select: { id: true, employeeId: true, date: true, closedAt: true },
          },
        },
      }),
      shiftCashupModel.count({ where }),
    ]);

    return res.json({
      data: rows,
      meta: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil((total || 0) / (limit || 1))),
      },
    });
  } catch (e: any) {
    console.error("GET /daily-sales/cashups error:", e);
    return res.status(500).json({ error: "failed_to_list_cashups", detail: e?.message });
  }
});

/** -------- NEW: Shifts today grouped by employee (names + totals) --------
 * GET /api/daily-sales/shifts/today?waiterType=INSIDE|FIELD
 */

// Explicit types to avoid `never[]` inference
type ShiftToday = {
  id: number;
  employeeId: number;
  employeeName: string;
  status: "OPEN" | "CLOSED";
  openedAt: Date;
  closedAt: Date | null;
  cashDue: number;
  lastCashupAt: Date | null;
};

type GroupToday = {
  employeeId: number;
  employeeName: string;
  totalCashDue: number;
  shifts: ShiftToday[];
};

const zTodayQuery = z.object({
  waiterType: z.enum(["INSIDE", "FIELD"]).optional(),
});

r.get("/shifts/today", requireAuth, requireAdmin, async (req, res) => {
  try {
    const q = zTodayQuery.safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ error: "invalid_query", detail: q.error.flatten() });
    }
    const waiterType = q.data.waiterType || undefined;

    const dateStr = ymdTodayNairobi();
    const day = dateOnlyToUtc(dateStr);

    const where: any = { date: day };
    if (waiterType) where.waiterType = waiterType as any;

    const shifts = await shiftModel.findMany({
      where,
      orderBy: [{ openedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        date: true,
        employeeId: true,
        waiterType: true,
        openedAt: true,
        closedAt: true,
      },
    });

    if (!shifts.length) {
      return res.json({ date: dateStr, waiterType: waiterType ?? null, employees: [] });
    }

    const empIds = Array.from(new Set(shifts.map((s: any) => s.employeeId)));
    const emps = await employeeModel.findMany({
      where: { id: { in: empIds } },
      select: { id: true, name: true },
    });
    const empName = new Map<number, string>();
    for (const e of emps) empName.set(e.id, e.name);

    const enriched: ShiftToday[] = await Promise.all(
      shifts.map(async (s: any): Promise<ShiftToday> => {
        const summary = await buildSummary(s.id);
        const cashDue = Number(summary.totals.cashDue || 0);
        const lastCashup = await getLatestCashupMeta(s.id);
        return {
          id: s.id,
          employeeId: s.employeeId,
          employeeName: empName.get(s.employeeId) ?? `#${s.employeeId}`,
          status: s.closedAt ? "CLOSED" : "OPEN",
          openedAt: s.openedAt,
          closedAt: s.closedAt ?? null,
          cashDue,
          lastCashupAt: lastCashup?.createdAt ?? null,
        };
      })
    );

    const groups: Map<number, GroupToday> = new Map();

    for (const row of enriched) {
      const g =
        groups.get(row.employeeId) ??
        ({
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          totalCashDue: 0,
          shifts: [] as ShiftToday[],
        } satisfies GroupToday);

      g.totalCashDue += row.cashDue;
      g.shifts.push({
        id: row.id,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        status: row.status,
        openedAt: row.openedAt,
        closedAt: row.closedAt,
        cashDue: row.cashDue,
        lastCashupAt: row.lastCashupAt,
      });
      groups.set(row.employeeId, g);
    }

    return res.json({
      date: dateStr,
      waiterType: waiterType ?? null,
      employees: Array.from(groups.values()).sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName)
      ),
    });
  } catch (e: any) {
    console.error("GET /daily-sales/shifts/today error:", e);
    return res.status(500).json({ error: "failed_to_list_today_groups", detail: e?.message });
  }
});

export default r;
