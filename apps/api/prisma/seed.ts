// apps/api/prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedItem = {
  name: string;
  priceSell: number;
  category?: string | null;
  unit?: string;
  costUnit?: number | null;
  active?: boolean;
};

const items: SeedItem[] = [
  { name: "Chips with Fish",  priceSell: 300, category: "Food" },
  { name: "Chips with Beef",  priceSell: 300, category: "Food" },

  { name: "Mbuzi Choma Ugali 1/4",    priceSell: 350, category: "Food" },
  { name: "Mbuzi Chemsha Ugali 1/4",  priceSell: 350, category: "Food" },
  { name: "Mbuzi Choma Rice",         priceSell: 380, category: "Food" },
  { name: "Mbuzi Chemsha Rice",       priceSell: 380, category: "Food" },

  { name: "Fish Ugali",               priceSell: 350, category: "Food" },
  { name: "Fish Rice",                priceSell: 350, category: "Food" },

  { name: "Omena Ugali",              priceSell: 180, category: "Food" },
  { name: "Matumbo Ugali",            priceSell: 180, category: "Food" },
  { name: "Matumbo Rice",             priceSell: 180, category: "Food" },
  { name: "Matumbo With 2 Chapati",   priceSell: 180, category: "Food" },
  { name: "Matumbo With 1 Chapati",   priceSell: 150, category: "Food" },

  { name: "Mala Ugali",               priceSell: 170, category: "Food" },

  { name: "Githeri Plain",            priceSell: 200, category: "Food" },
  { name: "Githeri Nyama",            priceSell: 250, category: "Food" },
  { name: "Chips Plain",              priceSell: 180, category: "Food" },

  { name: "Chicken Ugali",            priceSell: 400, category: "Food" },
  { name: "Chicken With 2 Chapo",     priceSell: 400, category: "Food" },
  { name: "Chicken With 1 Chapo",     priceSell: 400, category: "Food" },

  { name: "Minji Nyama With Chapati", priceSell: 250, category: "Food" },
  { name: "Minji Nyama With Rice",    priceSell: 250, category: "Food" },

  { name: "Njahi Plain",              priceSell: 100, category: "Food" },
  { name: "Minji Plain",              priceSell: 100, category: "Food" },
  { name: "Matumbo Plain",            priceSell: 130, category: "Food" },
];

async function upsertMenuItem(it: SeedItem) {
  const { name, priceSell, category = "Food", unit = "plate", costUnit = null, active = true } = it;
  const existing = await prisma.menuItem.findFirst({ where: { name } });
  if (existing) {
    await prisma.menuItem.update({
      where: { id: existing.id },
      data: { category, unit, priceSell, costUnit, active },
    });
  } else {
    await prisma.menuItem.create({
      data: { name, category, unit, priceSell, costUnit, active },
    });
  }
}

// NEW: salaried employee so payroll can run
async function upsertDefaultEmployee() {
  const $ = prisma as any; // bypass stale TS types for new fields/enums
  await $.employee.upsert({
    where: { id: 1 },
    update: { salaryMonthly: "30000", active: true }, // Decimal as string is fine
    create: {
      id: 1,
      name: "Default Waiter",
      role: "WAITER",   // enum value as string
      type: "INSIDE",   // enum value as string
      active: true,
      salaryMonthly: "30000",
    },
  });
}

async function main() {
  await upsertDefaultEmployee();
  for (const it of items) await upsertMenuItem(it);
  console.log(`Seeded employee #1 and ${items.length} menu items ✅`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
