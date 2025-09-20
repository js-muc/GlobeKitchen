// apps/api/prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedItem = {
  name: string;
  priceSell: number;        // selling price in KES
  category?: string | null; // optional category label
  unit?: string;            // defaults to 'plate'
  costUnit?: number | null; // leave null for now
  active?: boolean;
};

const items: SeedItem[] = [
  // Handwritten items at top of the page
  { name: "Chips with Fish",  priceSell: 300, category: "Food" }, // from top margin
  { name: "Chips with Beef",  priceSell: 300, category: "Food" }, // from top margin

  // Printed list
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

  // These three were a bit fuzzy in the photo; please confirm the exact prices if needed
  { name: "Githeri Plain",            priceSell: 200, category: "Food" }, // TODO: confirm (looked ~200)
  { name: "Githeri Nyama",            priceSell: 250, category: "Food" },
  { name: "Chips Plain",              priceSell: 180, category: "Food" }, // TODO: confirm (looked ~180)

  { name: "Chicken Ugali",            priceSell: 400, category: "Food" },

  // The next two lines were hard to read; set to 400 for now—please confirm
  { name: "Chicken With 2 Chapo",     priceSell: 400, category: "Food" }, // TODO: confirm
  { name: "Chicken With 1 Chapo",     priceSell: 400, category: "Food" }, // TODO: confirm

  { name: "Minji Nyama With Chapati", priceSell: 250, category: "Food" },
  { name: "Minji Nyama With Rice",    priceSell: 250, category: "Food" },

  { name: "Njahi Plain",              priceSell: 100, category: "Food" },
  { name: "Minji Plain",              priceSell: 100, category: "Food" },
  { name: "Matumbo Plain",            priceSell: 130, category: "Food" },
];

async function upsertMenuItem(it: SeedItem) {
  const {
    name,
    priceSell,
    category = "Food",
    unit = "plate",
    costUnit = null,
    active = true,
  } = it;

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

async function main() {
  for (const it of items) {
    await upsertMenuItem(it);
  }
  console.log(`Seeded ${items.length} menu items ✅`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
