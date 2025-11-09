import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const shiftId = Number(process.argv[2] || 154);
  if (!Number.isFinite(shiftId)) {
    console.error("Usage: node dump-recalc-shift-netSales.mjs <shiftId>");
    process.exit(1);
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, employeeId: true, date: true, waiterType: true, netSales: true }
  });

  if (!shift) {
    console.error("Shift not found:", shiftId);
    await prisma.$disconnect();
    process.exit(1);
  }

  const start = new Date(shift.date); start.setHours(0,0,0,0);
  const end = new Date(shift.date); end.setHours(23,59,59,999);

  const candidateModels = ['tableSale','TableSale','order','Order','sale','Sale','invoice','Invoice'];
  let foundAny = false;
  let aggregatedTotal = 0;
  const hits = [];

  for (const m of candidateModels) {
    try {
      const model = prisma[m];
      if (!model || typeof model.findMany !== 'function') continue;

      let rows = [];
      try {
        rows = await model.findMany({ where: { shiftId: shiftId } });
      } catch (err) {
        try {
          rows = await model.findMany({ where: { employeeId: shift.employeeId, date: { gte: start, lte: end } } });
        } catch (err2) {
          continue;
        }
      }

      if (!rows || rows.length === 0) continue;

      let sum = 0;
      for (const r of rows) {
        if (typeof r.total === 'number') sum += r.total;
        else if (typeof r.netAmount === 'number') sum += r.netAmount;
        else if (typeof r.totalAmount === 'number') sum += r.totalAmount;
        else if (typeof r.amount === 'number') sum += r.amount;
        else if (typeof r.netSales === 'number') sum += r.netSales;
        else {
          for (const k of Object.keys(r)) {
            const v = r[k];
            if (typeof v === 'string' && /^[0-9,.\s]+$/.test(v)) {
              const n = Number(String(v).replace(/[, \u00A0]+/g,''));
              if (!Number.isNaN(n)) { sum += n; break; }
            }
          }
        }
      }

      if (sum > 0) {
        foundAny = true;
        aggregatedTotal += sum;
        hits.push({ model: m, count: rows.length, sum });
      }
    } catch (err) {
      continue;
    }
  }

  console.log(JSON.stringify({ shiftId: shift.id, employeeId: shift.employeeId, date: shift.date.toISOString().slice(0,10), currentNetSales: shift.netSales, foundAny, hits, aggregatedTotal }, null, 2));

  if (foundAny && aggregatedTotal > 0) {
    const updated = await prisma.shift.update({ where: { id: shift.id }, data: { netSales: String(aggregatedTotal) } });
    console.log("Updated shift.netSales ->", updated.netSales);
  } else {
    console.log("No sales records found for this shift/date by the candidate models; no update performed.");
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
