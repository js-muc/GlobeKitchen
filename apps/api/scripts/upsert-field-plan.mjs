import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const brackets = [
    { min: 100, max: 500, fixed: 100 },
    { min: 501, max: 750, fixed: 200 },
    { min: 751, max: 1000, fixed: 300 },
    { min: 1001, max: 1500, fixed: 350 },
    { min: 1501, max: 2000, fixed: 400 },
    { min: 2001, max: 2500, fixed: 450 },
    { min: 2501, max: 3000, fixed: 500 },
    { min: 3001, max: 3500, fixed: 550 },
    { min: 3501, max: 4000, fixed: 600 },
    { min: 4001, max: 4500, fixed: 650 },
    { min: 4501, max: 5000, fixed: 700 },
    { min: 5001, max: 5500, fixed: 750 },
    { min: 5501, max: 6000, fixed: 800 },
    { min: 6001, max: 6500, fixed: 850 },
    { min: 6501, max: 7000, fixed: 900 },
    { min: 7001, max: 7500, fixed: 950 },
    { min: 7501, max: 8000, fixed: 1000 },
    { min: 8001, max: 8500, fixed: 1050 },
    { min: 8501, max: 9000, fixed: 1100 },
    { min: 9001, max: 9500, fixed: 1150 },
    { min: 9501, max: 10000, fixed: 1200 }
  ];

  // Find existing default FIELD plan (if any)
  const existing = await prisma.commissionPlan.findFirst({ where: { role: "FIELD", isDefault: true } });

  if (existing) {
    const updated = await prisma.commissionPlan.update({
      where: { id: existing.id },
      data: { bracketsJson: brackets }
    });
    console.log("Updated existing FIELD default plan id:", updated.id);
  } else {
    const created = await prisma.commissionPlan.create({
      data: {
        name: "FIELD - canonical",
        role: "FIELD",
        isDefault: true,
        bracketsJson: brackets
      }
    });
    console.log("Created new FIELD default plan id:", created.id);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
