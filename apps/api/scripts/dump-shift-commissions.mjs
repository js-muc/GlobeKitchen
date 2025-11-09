import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const year = Number(process.env.YEAR || process.argv[2] || new Date().getFullYear());
  const month = Number(process.env.MONTH || process.argv[3] || (new Date().getMonth() + 1));
  console.log(`Querying shift cashup snapshots for ${year}-${String(month).padStart(2,"0")} ...`);

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
    orderBy: { employeeId: "asc" }
  });

  for (const s of shifts) {
    const snapshot = s.cashup?.snapshot ?? null;
    const commission = snapshot?.commission ?? null;
    console.log(JSON.stringify({
      shiftId: s.id,
      employeeId: s.employeeId,
      waiterType: s.waiterType,
      date: s.date.toISOString().slice(0,10),
      cashupId: s.cashup?.id ?? null,
      commission
    }, null, 2));
  }

  console.log(`Done — total shifts found: ${shifts.length}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
