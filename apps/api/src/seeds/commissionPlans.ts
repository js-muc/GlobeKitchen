// apps/api/src/seeds/commissionPlans.ts
import { PrismaClient, CommissionRole } from '@prisma/client';
import { pathToFileURL } from 'url';

const prisma = new PrismaClient();

/** INSIDE — fixed KES by daily net sales */
const INSIDE_BRACKETS: Array<{ min: number; max: number; fixed: number }> = [
  { min: 4000,  max: 5000,  fixed: 300 },
  { min: 5001,  max: 6000,  fixed: 350 },
  { min: 6001,  max: 7000,  fixed: 400 },
  { min: 7001,  max: 8000,  fixed: 450 },
  { min: 8001,  max: 9000,  fixed: 500 },
  { min: 9001,  max: 10000, fixed: 550 },
  { min: 10001, max: 11000, fixed: 600 },
  { min: 11001, max: 12000, fixed: 650 },
  { min: 12001, max: 13000, fixed: 700 },
  { min: 13001, max: 14000, fixed: 750 },
  { min: 14001, max: 15000, fixed: 800 },
  { min: 15001, max: 16000, fixed: 850 },
  { min: 16001, max: 17000, fixed: 900 },
  { min: 17001, max: 18000, fixed: 950 },
  { min: 18001, max: 20000, fixed: 1000 },
];

/** FIELD — fixed KES by daily cash collected */
const FIELD_BRACKETS: Array<{ min: number; max: number; fixed: number }> = [
  { min: 100,    max: 500,    fixed: 100 },
  { min: 501,   max: 750,    fixed: 200 },
  { min: 751,   max: 1000,   fixed: 300 },
  { min: 1001,  max: 1500,   fixed: 350 },
  { min: 1501,  max: 2000,   fixed: 400 },
  { min: 2001,  max: 2500,   fixed: 450 },
  { min: 2501,  max: 3000,   fixed: 500 },
  { min: 3001,  max: 3500,   fixed: 550 },
  { min: 3501,  max: 4000,   fixed: 600 },
  { min: 4001,  max: 4500,   fixed: 650 },
  { min: 4501,  max: 5000,   fixed: 700 },
  { min: 5001,  max: 5500,   fixed: 750 },
  { min: 5501,  max: 6000,   fixed: 800 },
  { min: 6001,  max: 6500,   fixed: 850 },
  { min: 6501,  max: 7000,   fixed: 900 },
  { min: 7001,  max: 7500,   fixed: 950 },
  { min: 7501,  max: 8000,   fixed: 1000 },
  { min: 8001,  max: 8500,   fixed: 1050 },
  { min: 8501,  max: 9000,   fixed: 1100 },
  { min: 9001,  max: 9500,   fixed: 1150 },
  { min: 9501,  max: 10000,  fixed: 1200 },

];

export async function seedInsideCommissionPlan() {
  const name = 'Inside Waiter Default';
  const role = CommissionRole.INSIDE;

  const plan = await prisma.commissionPlan.upsert({
    where: { name },
    update: {
      role,
      isDefault: true,
      bracketsJson: INSIDE_BRACKETS as any,
    },
    create: {
      name,
      role,
      isDefault: true,
      bracketsJson: INSIDE_BRACKETS as any,
    },
  });

  await prisma.commissionPlan.updateMany({
    where: { role, NOT: { id: plan.id } },
    data: { isDefault: false },
  });

  return plan;
}

export async function seedFieldCommissionPlan() {
  const name = 'Field Default Brackets';
  const role = CommissionRole.FIELD;

  const plan = await prisma.commissionPlan.upsert({
    where: { name },
    update: {
      role,
      isDefault: true,
      bracketsJson: FIELD_BRACKETS as any,
    },
    create: {
      name,
      role,
      isDefault: true,
      bracketsJson: FIELD_BRACKETS as any,
    },
  });

  await prisma.commissionPlan.updateMany({
    where: { role, NOT: { id: plan.id } },
    data: { isDefault: false },
  });

  return plan;
}

export async function seedCommissionPlans() {
  const inside = await seedInsideCommissionPlan();
  const field = await seedFieldCommissionPlan();
  return { inside, field };
}

// ---- ESM-safe "run directly" guard (replaces require.main === module) ----
const isDirect = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  (async () => {
    try {
      const r = await seedCommissionPlans();
      console.log('Commission plans seeded:', r);
    } catch (err) {
      console.error('Seeding commission plans failed:', err);
      process.exit(1);
    } finally {
      await prisma.$disconnect();
    }
  })();
}
