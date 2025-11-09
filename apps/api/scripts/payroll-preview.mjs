import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

function number(v){ return typeof v === "number" ? v : Number(v ?? 0); }

async function main() {
  const argv = process.argv.slice(2);
  const year = argv[0] ? Number(argv[0]) : 2025;
  const month = argv[1] ? Number(argv[1]) : 11;
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    console.error("Usage: node payroll-preview.mjs <year> <month>");
    process.exit(2);
  }
  const start = new Date(Date.UTC(year, month - 1, 1, 0,0,0,0));
  const end = new Date(Date.UTC(year, month, 1, 0,0,0,0));
  console.log(`Computing preview for ${year}-${String(month).padStart(2,"0")} (UTC range ${start.toISOString()} .. ${end.toISOString()})`);

  // collect shifts in month that have a cashup snapshot.commission
  const shifts = await p.shift.findMany({
    where: { date: { gte: start, lt: end }, cashup: { isNot: null } },
    select: { id: true, employeeId: true, date: true, cashup: { select: { snapshot: true } } }
  });

  // aggregate per employee
  const perEmp = new Map();
  let grand = 0;
  for (const s of shifts) {
    const comm = s.cashup?.snapshot?.commission;
    const amt = comm && typeof comm.amount === "number" ? comm.amount : 0;
    if (!perEmp.has(s.employeeId)) perEmp.set(s.employeeId, { employeeId: s.employeeId, total: 0, rows: [] });
    const e = perEmp.get(s.employeeId);
    e.total += amt;
    e.rows.push({ shiftId: s.id, date: s.date?.toISOString()?.slice(0,10) ?? null, amount: amt, raw: comm ?? null });
    grand += amt;
  }

  // fetch employee names
  const empIds = Array.from(perEmp.keys());
  const employees = empIds.length ? await p.employee.findMany({ where: { id: { in: empIds } }, select: { id: true, name: true, phone: true } }) : [];
  const empById = new Map(employees.map(x=>[x.id,x]));

  const out = [];
  for (const [id, v] of perEmp.entries()) {
    const emp = empById.get(id) ?? null;
    out.push({ employeeId: id, name: emp?.name ?? null, phone: emp?.phone ?? null, commissionTotal: Number(v.total.toFixed(2)), shifts: v.rows });
  }
  out.sort((a,b)=> b.commissionTotal - a.commissionTotal);

  const result = { month: `${year}-${String(month).padStart(2,"0")}`, perEmployee: out, grandTotal: Number(grand.toFixed(2)), shiftsCounted: shifts.length };
  console.log(JSON.stringify(result, null, 2));
  await p.$disconnect();
  return 0;
}

main().catch(e=>{ console.error(e); process.exit(1); });
