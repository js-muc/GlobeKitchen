import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const r = Router();

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date: Date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

// GET /api/field/summary/daily?date=YYYY-MM-DD
// -> { ok, date, items: [{ employeeId, name, sales, commission, deductions }] }
r.get("/field/summary/daily", async (req, res) => {
  const dateISO = String(req.query.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    return res.status(400).json({ error: "invalid_date" });
  }

  const day = new Date(`${dateISO}T00:00:00.000Z`);
  const from = startOfDay(day);
  const to = endOfDay(day);

  try {
    // 1) Sum sale lines for that date (by shiftId)
    const lineGroups = await prisma.saleLine.groupBy({
      by: ["shiftId"],
      where: {
        // saleLine.date is stored as a DATE in your schema; this range works too
        date: { gte: from, lt: to },
      },
      _sum: { total: true, commissionEarned: true },
    });

    if (lineGroups.length === 0) {
      return res.json({ ok: true, date: dateISO, items: [] });
    }

    const shiftIds = lineGroups.map((g) => g.shiftId);

    // 2) Fetch shifts -> get employeeId per shift
    const shifts = await prisma.shift.findMany({
      where: { id: { in: shiftIds } },
      select: { id: true, employeeId: true },
    });

    // 3) Fetch employee names in one shot
    const employeeIds = Array.from(new Set(shifts.map((s) => s.employeeId)));
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, name: true },
    });
    const empNameById = new Map<number, string>(
      employees.map((e) => [e.id, e.name])
    );

    // 4) Group by employeeId: accumulate sales + commission across their shifts
    const byEmp = new Map<
      number,
      { name: string; sales: number; commission: number }
    >();

    for (const s of shifts) {
      const sums = lineGroups.find((g) => g.shiftId === s.id);
      const sales = Number(sums?._sum?.total ?? 0);
      const comm = Number(sums?._sum?.commissionEarned ?? 0);
      const name = empNameById.get(s.employeeId) ?? `#${s.employeeId}`;
      const prev =
        byEmp.get(s.employeeId) ?? { name, sales: 0, commission: 0 };
      prev.sales += sales;
      prev.commission += comm;
      byEmp.set(s.employeeId, prev);
    }

    // 5) Deductions for that day (date has time -> use range)
    const deds = await prisma.salaryDeduction.groupBy({
      by: ["employeeId"],
      where: {
        date: { gte: from, lt: to },
      },
      _sum: { amount: true },
    });

    // 6) Merge and emit
    const items = Array.from(byEmp.entries()).map(([employeeId, v]) => {
      const ded = deds.find((d) => d.employeeId === employeeId);
      const deductions = Number(ded?._sum?.amount ?? 0);
      return {
        employeeId,
        name: v.name,
        sales: v.sales,
        commission: v.commission,
        deductions,
      };
    });

    return res.json({ ok: true, date: dateISO, items });
  } catch (e: any) {
    console.error("GET /field/summary/daily error:", e);
    return res
      .status(500)
      .json({ error: "failed_to_fetch_field_summary", detail: e?.message });
  }
});

export default r;
