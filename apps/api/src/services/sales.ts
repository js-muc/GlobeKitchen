// apps/api/src/services/sales.ts
import { PrismaClient } from "@prisma/client";
import { dateOnlyUTCFromYMD } from "../lib/dateOnly.js";

const prisma = new PrismaClient();

/**
 * One editable shift per (day, employee).
 * If the latest is CLOSED and has NO cashup -> reopen it.
 * If there is a cashup -> create a fresh OPEN shift.
 *
 * You can optionally pass waiter metadata for new-shift creation,
 * in case your schema requires waiterType, etc.
 */
export async function getOrCreateEditableShift(opts: {
  ymd: string;            // "YYYY-MM-DD"
  employeeId: number;
  waiterType?: "INSIDE" | "FIELD";
  tableCode?: string | null;
  route?: string | null;
  openingFloat?: number | null;
  notes?: string | null;
}) {
  const dateOnly = dateOnlyUTCFromYMD(opts.ymd);

  // Latest shift for this employee on that date
  let latest = await (prisma as any).shift.findFirst({
    where: { employeeId: opts.employeeId, date: dateOnly },
    orderBy: { id: "desc" },
  });

  // If none exists → create a fresh OPEN shift
  if (!latest) {
    const now = new Date();
    // Build minimal creation payload; include waiter fields if provided
    const data: any = {
      date: dateOnly,
      employeeId: opts.employeeId,
      openedAt: now,
      notes: opts.notes ?? null,
    };
    if (typeof opts.openingFloat !== "undefined") data.openingFloat = opts.openingFloat;
    if (typeof opts.waiterType !== "undefined") data.waiterType = opts.waiterType;
    if (typeof opts.tableCode !== "undefined") data.tableCode = opts.tableCode ?? null;
    if (typeof opts.route !== "undefined") data.route = opts.route ?? null;

    latest = await (prisma as any).shift.create({ data });
    return latest;
  }

  // If it's already open (closedAt == null), use it
  if (!latest.closedAt) return latest;

  // If CLOSED: only reopen if no cashup exists
  const cashup = await (prisma as any).shiftCashup?.findFirst?.({
    where: { shiftId: latest.id },
    select: { id: true },
  });

  if (!cashup) {
    // Reopen by clearing closedAt and annotating notes
    const marker = `\n\n[REOPEN:${new Date().toISOString()}] ${JSON.stringify({
      prevClosedAt: latest.closedAt,
      reassignedTo: latest.employeeId,
    })}`;
    return (prisma as any).shift.update({
      where: { id: latest.id },
      data: { closedAt: null, notes: (latest.notes ?? "") + marker },
    });
  }

  // Cashup exists -> create a brand new OPEN shift for the same day/employee
  const now = new Date();
  const data: any = {
    date: dateOnly,
    employeeId: opts.employeeId,
    openedAt: now,
    notes: (latest.notes ?? "") + `\n\n[NEW_AFTER_CASHUP:${now.toISOString()}]`,
  };
  // Prefer provided waiter metadata; otherwise inherit from the previous shift if present
  const waiterType = opts.waiterType ?? latest.waiterType;
  if (typeof waiterType !== "undefined") data.waiterType = waiterType;
  const tableCode = (typeof opts.tableCode !== "undefined" ? opts.tableCode : latest.tableCode) ?? null;
  const route = (typeof opts.route !== "undefined" ? opts.route : latest.route) ?? null;
  data.tableCode = tableCode;
  data.route = route;
  if (typeof opts.openingFloat !== "undefined") data.openingFloat = opts.openingFloat;

  return (prisma as any).shift.create({ data });
}

/**
 * Add a sale line, guaranteeing we’re writing to an editable shift.
 * Returns BOTH the line and the (re)opened/created shift so the UI can
 * immediately switch to the correct active shift.
 */
export async function addLineWithReopenFirst(opts: {
  ymd: string;
  employeeId: number;
  itemId: number;
  qty: number;
  unitPrice: number;
  waiterType?: "INSIDE" | "FIELD";
  tableCode?: string | null;
  route?: string | null;
  openingFloat?: number | null;
  notes?: string | null;
}) {
  const shift = await getOrCreateEditableShift({
    ymd: opts.ymd,
    employeeId: opts.employeeId,
    waiterType: opts.waiterType,
    tableCode: opts.tableCode,
    route: opts.route,
    openingFloat: opts.openingFloat,
    notes: opts.notes,
  });

  // prefer saleLine; fallback shiftLine for legacy schemas
  const lineModel: any = (prisma as any).saleLine ?? (prisma as any).shiftLine;

  const line = await lineModel.create({
    data: {
      shiftId: shift.id,
      itemId: opts.itemId,
      qty: opts.qty,
      unitPrice: opts.unitPrice,
      // If your SaleLine has "date", keep it consistent with shift.date
      date: shift.date,
    },
  });

  return { shift, line };
}
