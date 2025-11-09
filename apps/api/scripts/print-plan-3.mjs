import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main(){
  const r = await p.commissionPlan.findUnique({ where: { id: 3 } });
  console.log(JSON.stringify(r?.bracketsJson ?? null, null, 2));
  await p.$disconnect();
}
main().catch(e=>{ console.error(e); process.exit(1); });
