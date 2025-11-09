import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // find default FIELD plan
  const plan = await prisma.commissionPlan.findFirst({ where: { role: "FIELD", isDefault: true } });
  if (!plan) {
    console.error("No default FIELD plan found.");
    process.exit(1);
  }

  const brackets = Array.isArray(plan.bracketsJson) ? plan.bracketsJson.slice() : [];

  if (brackets.length === 0) {
    // fallback: create one open-ended bracket if none exist
    brackets.push({ min: 0, max: 1000000000, fixed: 0 });
  } else {
    // extend last bracket max to a very large number
    const last = brackets[brackets.length - 1];
    // preserve last.fixed, update max
    last.max = 1000000000;
    brackets[brackets.length - 1] = last;
  }

  const updated = await prisma.commissionPlan.update({
    where: { id: plan.id },
    data: { bracketsJson: brackets }
  });

  console.log("Updated field plan id:", updated.id, "new last bracket:", brackets[brackets.length - 1]);
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
