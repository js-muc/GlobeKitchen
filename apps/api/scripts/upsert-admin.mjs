import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@example.com";
  const password = "admin123";
  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { password: hash },
    create: { email, password: hash },
  });

  console.log("Upserted admin:", user.email);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Upsert failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
