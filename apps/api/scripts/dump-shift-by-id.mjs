import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const id = Number(process.argv[2] || 154);
  const s = await prisma.shift.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      waiterType: true,
      date: true,
      openedAt: true,
      closedAt: true,
      netSales: true,
      cashup: { select: { id: true, snapshot: true } }
    }
  });
  console.log(JSON.stringify(s, null, 2));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
