import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE || "http://localhost:4000/api";

async function main() {
  console.log("Scanning FieldReturns for unique (waiterId,date)...");

  // Collect all returns with linked dispatch & waiter
  const returns = await prisma.fieldReturn.findMany({
    include: { dispatch: { select: { waiterId: true, date: true } } },
  });

  // Build a map waiterId → Set of ISO dates
  const combos = new Map();
  for (const r of returns) {
    if (!r.dispatch) continue;
    const wid = r.dispatch.waiterId;
    if (!wid) continue;
    const dateISO = new Date(r.dispatch.date).toISOString().slice(0, 10);
    if (!combos.has(wid)) combos.set(wid, new Set());
    combos.get(wid).add(dateISO);
  }

  console.log(`Found ${combos.size} field waiters with returns.`);
  let totalCalls = 0;

  for (const [wid, dates] of combos.entries()) {
    for (const d of dates) {
      const url = `${BASE}/commission/field/apply`;
      const body = JSON.stringify({ waiterId: wid, dateISO: d });
      try {
        // use global fetch (Node 18+)
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        let data;
        try { data = await res.json(); } catch (e) { data = { ok: false, error: "invalid json" }; }
        if (res.ok) {
          console.log(`✅ Applied: waiter ${wid}, ${d}, amount=${data.applied?.amount ?? "?"}`);
        } else {
          console.warn(`⚠️ Skip waiter ${wid}, ${d}:`, data);
        }
        totalCalls++;
      } catch (err) {
        console.error(`❌ Error waiter ${wid}, ${d}:`, err?.message ?? String(err));
      }
    }
  }

  console.log(`Done. Total API calls: ${totalCalls}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error("Batch apply error:", e);
  process.exit(1);
});
