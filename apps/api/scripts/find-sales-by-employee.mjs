import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const employeeId = Number(process.argv[2] || 14);
  const dateStr = process.argv[3] || (new Date()).toISOString().slice(0,10);
  const radiusDays = Number(process.argv[4] || 1); // +/- days
  const date = new Date(dateStr);
  const start = new Date(date); start.setDate(date.getDate() - radiusDays); start.setHours(0,0,0,0);
  const end = new Date(date); end.setDate(date.getDate() + radiusDays); end.setHours(23,59,59,999);

  console.log(`Searching sales records for employeeId=${employeeId} in ${start.toISOString()}..${end.toISOString()} ...`);

  const candidateModels = ['tableSale','TableSale','order','Order','sale','Sale','invoice','Invoice','fieldDispatch','FieldDispatch','fieldReturn','FieldReturn'];

  const results = [];

  for (const name of candidateModels) {
    try {
      const model = prisma[name];
      if (!model || typeof model.findMany !== 'function') continue;

      // try common query shapes
      const whereClauses = [
        { employeeId },
        { waiterId: employeeId },
        { serverId: employeeId },
        { date: { gte: start, lte: end } },
        { createdAt: { gte: start, lte: end } },
      ];

      // We'll perform up to 3 queries safely: by employeeId-like, by date-window, and combined.
      let rows = [];
      try { rows = await model.findMany({ where: { OR: whereClauses }, take: 20 }); } catch (e) {
        try { rows = await model.findMany({ where: { date: { gte: start, lte: end } }, take: 20 }); } catch (e2) {
          continue;
        }
      }

      if (rows && rows.length) {
        results.push({ model: name, count: rows.length, sample: rows.slice(0,5) });
      }
    } catch (err) {
      // ignore missing models or unsupported queries
      continue;
    }
  }

  console.log(JSON.stringify({ employeeId, date: dateStr, start: start.toISOString(), end: end.toISOString(), hits: results }, null, 2));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
