import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const year = Number(process.argv[2] || new Date().getFullYear());
  const month = Number(process.argv[3] || (new Date().getMonth() + 1));
  console.log(`Checking commissions for ${year}-${String(month).padStart(2,"0")} ...`);

  // load default field plan brackets (if any)
  const defaultPlan = await prisma.commissionPlan.findFirst({ where: { role: "FIELD", isDefault: true } });
  const defaultBrackets = Array.isArray(defaultPlan && defaultPlan.bracketsJson) ? defaultPlan.bracketsJson : [];
  const maxBracket = defaultBrackets.length ? Math.max(...defaultBrackets.map(b => Number(b.max || 0))) : 0;

  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);

  const shifts = await prisma.shift.findMany({
    where: { date: { gte: start, lt: end } },
    select: {
      id: true,
      employeeId: true,
      waiterType: true,
      date: true,
      cashup: { select: { id: true, snapshot: true } }
    },
    orderBy: { date: "asc" }
  });

  const problems = [];
  for (const s of shifts) {
    const snap = s.cashup && s.cashup.snapshot ? s.cashup.snapshot : null;
    const comm = snap ? snap.commission : null;

    // Determine cashCollected value if present
    const cashCollected = comm && typeof comm.cashCollected === 'number' ? comm.cashCollected : null;

    const isMissing = comm === null;
    const isZero = comm && typeof comm.amount === 'number' && comm.amount === 0;
    const exceedsMax = (typeof cashCollected === 'number' && maxBracket > 0 && cashCollected > maxBracket);

    if (isMissing || isZero || exceedsMax) {
      problems.push({
        shiftId: s.id,
        employeeId: s.employeeId,
        waiterType: s.waiterType,
        date: s.date.toISOString().slice(0,10),
        cashupId: s.cashup && s.cashup.id ? s.cashup.id : null,
        commission: comm,
        exceedsMax,
        maxBracket
      });
    }
  }

  console.log(JSON.stringify({ totalShifts: shifts.length, defaultPlanId: defaultPlan ? defaultPlan.id : null, maxBracket, problems }, null, 2));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
