// apps/api/src/routes/dailySalesShiftsCompat.ts
import { Router } from "express";
import { PrismaClient, Prisma, $Enums } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

/* ------------------------------------------------------------------ */
/*  TS shim so prisma.shiftCashup is recognized by the compiler        */
/*  (Runtime already has this model; this only fixes typing.)          */
/* ------------------------------------------------------------------ */
type ShiftCashupDelegate = {
  findMany: (args?: { where?: any; select?: any; orderBy?: any }) => Promise<Array<{ shiftId: number } & Record<string, any>>>;
  findFirst?: (args?: { where?: any; select?: any; orderBy?: any }) => Promise<{ shiftId: number } | null>;
  count: (args?: { where?: any }) => Promise<number>;
  create: (args: {
    data: {
      shiftId: number;
      snapshot: Prisma.JsonValue;
      note: string | null;
      submittedBy?: string;
      createdAt?: Date;
    };
  }) => Promise<any>;
};

type PrismaWithCashup = PrismaClient & { shiftCashup: ShiftCashupDelegate };
type PrismaTxWithCashup = Prisma.TransactionClient & { shiftCashup: ShiftCashupDelegate };

const prisma = new PrismaClient() as unknown as PrismaWithCashup;
const r = Router();

/** ---------- Date helpers (align with main router) ---------- */
function ymdTodayNairobi(): string {
  // "YYYY-MM-DD" for Africa/Nairobi
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

function dateOnlyToUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/** Find any OPEN shift today (any employee) */
async function findOpenShiftToday() {
  const date = dateOnlyToUtc(ymdTodayNairobi());
  return prisma.shift.findFirst({
    where: { date, closedAt: null },
    orderBy: { openedAt: "desc" },
  });
}

/** Resolve employeeId from either { employeeId } or { name } (case-insensitive) */
async function resolveEmployeeId(input: { employeeId?: unknown; name?: unknown }): Promise<number> {
  if (typeof input.employeeId === "number" && Number.isInteger(input.employeeId) && input.employeeId > 0) {
    return input.employeeId;
  }
  if (typeof input.employeeId === "string" && /^\d+$/.test(input.employeeId)) {
    return Number(input.employeeId);
  }

  const rawName = input.name;
  const name =
    typeof rawName === "string"
      ? rawName.trim()
      : typeof rawName === "number"
      ? String(rawName)
      : "";

  if (!name) {
    const err = new Error("employee_required") as any;
    err.code = "employee_required";
    throw err;
  }

  const byExact = await prisma.employee.findFirst({
    where: { active: true, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (byExact) return byExact.id;

  const byLike = await prisma.employee.findMany({
    where: { active: true, name: { startsWith: name, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 2,
  });
  if (byLike.length === 1) return byLike[0].id;

  const err = new Error(byLike.length === 0 ? "employee_not_found" : "employee_ambiguous") as any;
  err.code = byLike.length === 0 ? "employee_not_found" : "employee_ambiguous";
  throw err;
}

/* -------------------------------------------------------------------------- */
/*  Legacy endpoints: /api/daily-sales/shifts/... (compat layer)              */
/*  Preserves original behavior with better validation and TS correctness.    */
/* -------------------------------------------------------------------------- */

/** Shared enum (exactly what's in Prisma types) */
const zWaiterType = z.nativeEnum($Enums.EmployeeType);

/** GET /current?employeeId=#: OR /current?name=...  */
r.get("/current", requireAuth, requireAdmin, async (req, res) => {
  try {
    const employeeId = await resolveEmployeeId({
      employeeId: (req.query.employeeId as any) ?? undefined,
      name: (req.query.name as any) ?? undefined,
    });

    const date = dateOnlyToUtc(ymdTodayNairobi());
    const todays = await prisma.shift.findMany({
      where: { employeeId, date },
      orderBy: [{ openedAt: "desc" }],
    });

    if (todays.length === 0) return res.json({ ok: true, shift: null });

    const ids = todays.map((s) => s.id);
    const cashups = await prisma.shiftCashup.findMany({
      where: { shiftId: { in: ids } },
      select: { shiftId: true },
    });
    const hasCashupSet = new Set(cashups.map((c) => c.shiftId));

    const enriched = todays.map((s) => {
      const status: "OPEN" | "CLOSED" = s.closedAt ? "CLOSED" : "OPEN";
      const hasCashup = hasCashupSet.has(s.id);
      return { ...s, status, hasCashup };
    });

    const open = enriched.find((x) => x.status === "OPEN");
    const lastClosed = enriched.find((x) => x.status === "CLOSED");
    const current = open ?? lastClosed ?? null;
    return res.json({ ok: true, shift: current });
  } catch (e: any) {
    const code = e?.code || "bad_request";
    return res.status(400).json({ error: code });
  }
});

/** POST /open  Body: { employeeId? | name?, waiterType?: EmployeeType, notes? } */
const zOpen = z
  .object({
    employeeId: z.coerce.number().int().positive().optional(),
    name: z.string().min(1).optional(),
    waiterType: zWaiterType.optional(), // allow omitted; we’ll default from Employee.type
    notes: z.string().optional().nullable(),
  })
  .refine((d) => !!d.employeeId || !!d.name, {
    message: "employeeId_or_name_required",
    path: ["employee"],
  });

r.post("/open", requireAuth, requireAdmin, async (req, res) => {
  const parsed = zOpen.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_input",
      detail: parsed.error.flatten(),
    });
  }

  try {
    const employeeId = await resolveEmployeeId(parsed.data);

    // default waiterType from the employee if omitted
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { type: true },
    });
    if (!emp) return res.status(404).json({ error: "employee_not_found" });

    const waiterType: $Enums.EmployeeType =
      (parsed.data.waiterType as $Enums.EmployeeType | undefined) ?? emp.type;

    const notes: string | null =
      typeof parsed.data.notes === "string" ? parsed.data.notes : null;

    const date = dateOnlyToUtc(ymdTodayNairobi());

    // If this employee already has a shift today, return it
    const existing = await prisma.shift.findFirst({
      where: { employeeId, date },
      orderBy: { openedAt: "desc" },
    });
    if (existing) {
      const cashupExists = await prisma.shiftCashup.count({ where: { shiftId: existing.id } });
      const status: "OPEN" | "CLOSED" = existing.closedAt ? "CLOSED" : "OPEN";
      return res.json({ ok: true, shift: { ...existing, status, hasCashup: !!cashupExists } });
    }

    // Prevent two open shifts the same day (any employee)
    const openShift = await findOpenShiftToday();
    if (openShift) {
      return res.status(400).json({
        error: "another_open_exists",
        shift: { id: openShift.id, employeeId: openShift.employeeId, openedAt: openShift.openedAt },
        message: "Close current open shift before opening a new one.",
      });
    }

    const created = await prisma.shift.create({
      data: {
        date,
        employeeId,
        waiterType: waiterType as Prisma.ShiftCreateInput["waiterType"],
        openedAt: new Date(),
        notes,
      },
    });

    return res.json({ ok: true, shift: { ...created, status: "OPEN", hasCashup: false } });
  } catch (e: any) {
    const code = e?.code || "bad_request";
    return res.status(400).json({ error: code });
  }
});

/** POST /reopen  Body: { shiftId? , employeeId? | name? } */
const zReopen = z
  .object({
    shiftId: z.coerce.number().int().positive().optional(),
    employeeId: z.coerce.number().int().positive().optional(),
    name: z.string().min(1).optional(),
  })
  .refine((d) => !!d.shiftId || !!d.employeeId || !!d.name, {
    message: "shiftId_or_employee_required",
  });

r.post("/reopen", requireAuth, requireAdmin, async (req, res) => {
  const parsed = zReopen.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_input",
      detail: parsed.error.flatten(),
    });
  }

  const date = dateOnlyToUtc(ymdTodayNairobi());
  const dateIso = date.toISOString().slice(0, 10);

  let s =
    parsed.data.shiftId ? await prisma.shift.findUnique({ where: { id: parsed.data.shiftId } }) : null;

  try {
    if (!s) {
      const employeeId = await resolveEmployeeId(parsed.data);
      s = await prisma.shift.findFirst({
        where: { employeeId, date, closedAt: { not: null } },
        orderBy: { openedAt: "desc" },
      });
    }
  } catch (e: any) {
    const code = e?.code || "bad_request";
    return res.status(400).json({ error: code });
  }

  if (!s) return res.status(404).json({ error: "shift_not_found" });
  if (s.date.toISOString().slice(0, 10) !== dateIso) {
    return res.status(400).json({ error: "reopen_only_today" });
  }
  if (!s.closedAt) return res.status(400).json({ error: "shift_not_closed" });

  const openShift = await findOpenShiftToday();
  if (openShift && openShift.id !== s.id) {
    return res.status(400).json({
      error: "another_open_exists",
      shift: { id: openShift.id, employeeId: openShift.employeeId, openedAt: openShift.openedAt },
      message: "Close the currently open shift before reopening another.",
    });
  }

  const cashupExists = await prisma.shiftCashup.count({ where: { shiftId: s.id } });
  if (cashupExists) return res.status(400).json({ error: "cashup_exists" });

  const updated = await prisma.shift.update({
    where: { id: s.id },
    data: { closedAt: null },
  });
  return res.json({ ok: true, shift: { ...updated, status: "OPEN", hasCashup: false } });
});

/** POST /close  Body: { shiftId, snapshot, note?, submittedBy } */
const zClose = z.object({
  shiftId: z.coerce.number().int().positive(),
  snapshot: z.record(z.any()),
  note: z.string().optional().nullable(),
  submittedBy: z.string().min(1),
});

r.post("/close", requireAuth, requireAdmin, async (req, res) => {
  const parsed = zClose.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_input",
      detail: parsed.error.flatten(),
    });
  }

  const { shiftId, snapshot } = parsed.data;
  const note: string | null = typeof parsed.data.note === "string" ? parsed.data.note : null;
  const { submittedBy } = parsed.data;
  const date = dateOnlyToUtc(ymdTodayNairobi());
  const dateIso = date.toISOString().slice(0, 10);

  const s = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!s) return res.status(404).json({ error: "shift_not_found" });
  if (s.date.toISOString().slice(0, 10) !== dateIso) {
    return res.status(400).json({ error: "close_only_today" });
  }
  if (s.closedAt) return res.status(400).json({ error: "already_closed" });

  const cashupExists = await prisma.shiftCashup.count({ where: { shiftId } });
  if (cashupExists) return res.status(400).json({ error: "cashup_already_exists" });

  const result = await prisma.$transaction(async (tx0) => {
    const tx = tx0 as unknown as PrismaTxWithCashup;

    const closed = await tx.shift.update({
      where: { id: shiftId },
      data: { closedAt: new Date() },
    });

    const cashup = await tx.shiftCashup.create({
      data: {
        shiftId,
        snapshot: snapshot as Prisma.JsonValue,
        note,
        submittedBy,
        createdAt: new Date(),
      },
    });
    return { closed, cashup };
  });

  return res.json({
    ok: true,
    shift: { ...result.closed, status: "CLOSED", hasCashup: true },
    cashup: result.cashup,
  });
});

export default r;
