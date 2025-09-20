const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

(async () => {
  const p = new PrismaClient();
  const hash = bcrypt.hashSync("Admin@123", 10);
  await p.user.upsert({
    where: { email: "admin@globe-kitchen.co.ke" },
    update: { password: hash },
    create: { email: "admin@globe-kitchen.co.ke", password: hash },
  });
  console.log("admin upserted (bcrypt)");
  await p.$disconnect();
})();