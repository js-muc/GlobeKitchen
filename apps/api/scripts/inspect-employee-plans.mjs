import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // default ids to inspect (from the current check output). You may pass ids as args.
  const defaultIds = [14,16,19,30,18,15];
  const args = process.argv.slice(2).map(x => Number(x)).filter(x => Number.isFinite(x));
  const ids = args.length ? args : defaultIds;
  console.log("Inspecting employees:", ids);

  const employees = await prisma.employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true, type: true, commissionPlanId: true, phone: true, createdAt: true }
  });

  const out = [];
  for (const e of employees) {
    let plan = null;
    if (e.commissionPlanId) {
      plan = await prisma.commissionPlan.findUnique({ where: { id: e.commissionPlanId } });
    }
    out.push({ employee: e, commissionPlan: plan });
  }

  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
