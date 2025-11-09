import { PrismaClient, CommissionRole } from '@prisma/client';

const prisma = new PrismaClient();

const INSIDE_BRACKETS = [
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

async function main() {
  const name = 'Inside Waiter Default';
  const role = CommissionRole.INSIDE;

  const plan = await prisma.commissionPlan.upsert({
    where: { name },
    update: {
      role,
      isDefault: true,
      bracketsJson: INSIDE_BRACKETS,
    },
    create: {
      name,
      role,
      isDefault: true,
      bracketsJson: INSIDE_BRACKETS,
    },
  });

  await prisma.commissionPlan.updateMany({
    where: { role, NOT: { id: plan.id } },
    data: { isDefault: false },
  });

  console.log('✅ Inside plan seeded:', plan);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
});
