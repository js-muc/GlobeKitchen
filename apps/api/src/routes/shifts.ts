// apps/api/src/routes/shifts.ts
import { Router } from "express";
import { PrismaClient, Prisma, $Enums } from "@prisma/client";
import { z } from "zod";

// --- minimal typing for shiftCashup (runtime model exists) ---
type ShiftCashupDelegate = {
  findMany: (args: { where?: any; select?: any }) => Promise<Array<{ shiftId: number }>>;
  count: (args: { where?: any }) => Promise<number>;
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

/** Nairobi “business day” in YYYY-MM-DD, then use as Date for Prisma DATE column */
function todayISODateNairobi(): string {
  const now = new Date();
  const nairobiMs = now.getTime() + 3 * 60 * 60 * 1000; // UTC+3
  const nairobi = new Date(nairobiMs);
  return nairobi.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** Helper: find any OPEN shift today (regardless of employee) — kept for back-compat (not used in new guards) */
async function findOpenShiftToday() {
  const dateIso = todayISODateNairobi();
  const date = new Date(dateIso);
  return prisma.shift.findFirst({
    where: { date, closedAt: null },
    orderBy: { openedAt: "desc" },
  });
}

/** NEW: find OPEN shift for a specific employee (any date) */
async function findOpenShiftForEmployee(employeeId: number) {
  return prisma.shift.findFirst({
    where: { employeeId, closedAt: null },
    orderBy: { openedAt: "desc" },
  });
}

/** NEW: find OPEN shift for this employee on today's date */
async function findOpenShiftTodayForEmployee(employeeId: number) {
  const date = new Date(todayISODateNairobi());
  return prisma.shift.findFirst({
    where: { employeeId, date, closedAt: null },
    orderBy: { openedAt: "desc" },
  });
}

/**
 * GET /api/shifts/current?employeeId=2
 * Returns today's OPEN shift if any; else last CLOSED today (with hasCashup flag) for THIS employee.
 */
r.get("/current", async (req, res) => {
  const employeeId = Number(req.query.employeeId);
  if (!employeeId || Number.isNaN(employeeId)) {
    return res.status(400).json({ error: "employeeId_required" });
  }

  const date = todayISODateNairobi();

  const todays = await prisma.shift.findMany({
    where: { employeeId, date: new Date(date) },
    orderBy: [{ openedAt: "desc" }],
  });

  if (todays.length === 0) {
    return res.json({ ok: true, shift: null });
  }

  // Bulk check for cashups
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
});

/**
 * POST /api/shifts/open
 * Body: { employeeId: number, waiterType: WaiterType, notes?: string }
 * Behavior (UPDATED):
 *  - If this employee already has a shift today -> return it.
 *  - If this employee has a stale OPEN shift from a previous day -> 400 previous_open_not_closed.
 *  - Else -> create new OPEN shift. (Multiple employees can have OPEN shifts today.)
 */
const zOpen = z.object({
  employeeId: z.coerce.number().int().positive(),
  // Prisma v5 exposes runtime enums via $Enums; for Zod validation we use a pure string enum,
  // then cast to $Enums.WaiterType for the Prisma call to satisfy TS.
  waiterType: z.enum(["INSIDE", "FIELD", "KITCHEN"]),
  notes: z.string().optional().nullable(),
});
type OpenInput = z.infer<typeof zOpen>;

r.post("/open", async (req, res) => {
  const parsed = zOpen.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });

  const { employeeId, waiterType, notes } = parsed.data as OpenInput;

  const dateIso = todayISODateNairobi();
  const date = new Date(dateIso);

  // 1) If this employee already has today's shift, return it
  const existingForEmployeeToday = await prisma.shift.findFirst({
    where: { employeeId, date },
    orderBy: { openedAt: "desc" },
  });
  if (existingForEmployeeToday) {
    const cashupExists = await prisma.shiftCashup.count({ where: { shiftId: existingForEmployeeToday.id } });
    const status: "OPEN" | "CLOSED" = existingForEmployeeToday.closedAt ? "CLOSED" : "OPEN";
    return res.json({ ok: true, shift: { ...existingForEmployeeToday, status, hasCashup: !!cashupExists } });
  }

  // 2) If this employee has ANY other OPEN shift (yesterday/older), block with precise error
  const anyOpenForEmployee = await findOpenShiftForEmployee(employeeId);
  if (anyOpenForEmployee) {
    const openDate = anyOpenForEmployee.date.toISOString().slice(0, 10);
    if (openDate !== dateIso) {
      return res.status(400).json({
        error: "previous_open_not_closed",
        message: "Employee has an open shift from a previous day. Close it before opening a new one.",
        shift: {
          id: anyOpenForEmployee.id,
          date: anyOpenForEmployee.date,
          openedAt: anyOpenForEmployee.openedAt,
        },
      });
    }
    // If it's somehow today's open, the earlier branch would have returned it already.
  }

  // 3) Create a new OPEN shift for this employee (allow multiple employees to be OPEN today)
  const created = await prisma.shift.create({
    data: {
      date,
      employeeId,
      waiterType: waiterType as Prisma.ShiftCreateInput["waiterType"],
      openedAt: new Date(),
      notes: notes ?? null,
    },
  });

  return res.json({
    ok: true,
    shift: { ...created, status: "OPEN", hasCashup: false },
  });
});

/** POST /api/shifts/reopen { shiftId } — same-day (Nairobi), must be closed, no cashup yet, and no other OPEN shift for THIS employee today */
const zReopen = z.object({ shiftId: z.coerce.number().int().positive() });
type ReopenInput = z.infer<typeof zReopen>;

r.post("/reopen", async (req, res) => {
  const parsed = zReopen.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });

  const { shiftId } = parsed.data as ReopenInput;
  const dateIso = todayISODateNairobi();

  const s = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!s) return res.status(404).json({ error: "shift_not_found" });

  // Guard: same Nairobi business day
  if (s.date.toISOString().slice(0, 10) !== dateIso) {
    return res.status(400).json({ error: "reopen_only_today" });
  }
  if (!s.closedAt) return res.status(400).json({ error: "shift_not_closed" });

  // Guard (UPDATED): there must be no other OPEN shift TODAY for THIS employee (id != s.id)
  const otherOpenTodayForEmployee = await findOpenShiftTodayForEmployee(s.employeeId);
  if (otherOpenTodayForEmployee && otherOpenTodayForEmployee.id !== s.id) {
    return res.status(400).json({
      error: "employee_already_open_today",
      shift: {
        id: otherOpenTodayForEmployee.id,
        employeeId: otherOpenTodayForEmployee.employeeId,
        openedAt: otherOpenTodayForEmployee.openedAt,
      },
      message: "This employee already has another open shift today.",
    });
  }

  // Guard: no cashup exists yet for this shift
  const cashupExists = await prisma.shiftCashup.count({ where: { shiftId } });
  if (cashupExists) return res.status(400).json({ error: "cashup_exists" });

  const updated = await prisma.shift.update({
    where: { id: shiftId },
    data: { closedAt: null },
  });

  return res.json({
    ok: true,
    shift: { ...updated, status: "OPEN", hasCashup: false },
  });
});

/** POST /api/shifts/close { shiftId, snapshot, note?, submittedBy } — same-day (Nairobi) */
const zClose = z.object({
  shiftId: z.coerce.number().int().positive(),
  snapshot: z.record(z.any()),
  note: z.string().optional().nullable(),
  submittedBy: z.string().min(1),
});
type CloseInput = z.infer<typeof zClose>;

r.post("/close", async (req, res) => {
  const parsed = zClose.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });

  const { shiftId, snapshot, note, submittedBy } = parsed.data as CloseInput;
  const dateIso = todayISODateNairobi();

  const s = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!s) return res.status(404).json({ error: "shift_not_found" });

  // Guard: same Nairobi business day
  if (s.date.toISOString().slice(0, 10) !== dateIso) {
    return res.status(400).json({ error: "close_only_today" });
  }
  if (s.closedAt) {
    return res.status(400).json({ error: "already_closed" });
  }

  // Defensive: no cashup exists yet
  const cashupExists = await prisma.shiftCashup.count({ where: { shiftId } });
  if (cashupExists) {
    return res.status(400).json({ error: "cashup_already_exists" });
  }

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
        note: (note ?? null) as string | null,
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
