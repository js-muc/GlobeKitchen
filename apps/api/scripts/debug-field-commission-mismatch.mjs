import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// copy of parseBrackets + match from server (robust parsing + last-bracket inclusive)
function parseBrackets(raw) {
  if (!raw) return [];
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    return arr
      .map((b) => {
        const normalize = (x) => {
          if (x == null) return NaN;
          const s = String(x).replace(/[, \u00A0]+/g, '').trim();
          return Number(s);
        };
        return { min: normalize(b?.min), max: normalize(b?.max), fixed: normalize(b?.fixed) };
      })
      .filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max) && Number.isFinite(b.fixed))
      .sort((a, b) => a.min - b.min);
  } catch (e) {
    return [];
  }
}

function match(brs, v) {
  if (!brs || brs.length === 0) return null;
  for (let i = 0; i < brs.length; i++) {
    const b = brs[i];
    const isLast = i === brs.length - 1;
    if (v >= b.min && (isLast ? v <= b.max : v < b.max)) return b;
  }
  return null;
}

async function main() {
  const year = 2025, month = 11;
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);

  // load candidate FIELD shifts where commission exists but amount === 0 and cashCollected > 0
  const shifts = await prisma.shift.findMany({
    where: { date: { gte: start, lt: end }, waiterType: 'FIELD' },
    select: {
      id: true,
      employeeId: true,
      date: true,
      cashup: { select: { id: true, snapshot: true } }
    },
    orderBy: { date: 'asc' }
  });

  const defaultPlan = await prisma.commissionPlan.findFirst({ where: { role: 'FIELD', isDefault: true } });

  const problems = [];

  for (const s of shifts) {
    const snap = s.cashup?.snapshot ?? null;
    const comm = snap?.commission ?? null;
    const cashCollected = comm && typeof comm.cashCollected === 'number' ? comm.cashCollected : (comm && typeof comm.cashCollected === 'string' ? Number(String(comm.cashCollected).replace(/[, \u00A0]+/g, '')) : null);
    if (!comm || typeof comm.amount !== 'number' || comm.amount !== 0) continue;
    if (!(typeof cashCollected === 'number' && cashCollected > 0)) continue; // only care where cashCollected > 0 but amount 0

    // determine plan used (employee-specific or default)
    const emp = await prisma.employee.findUnique({ where: { id: s.employeeId }, select: { id: true, name: true, commissionPlanId: true } });
    let plan = null;
    if (emp?.commissionPlanId) plan = await prisma.commissionPlan.findUnique({ where: { id: emp.commissionPlanId } });
    if (!plan) plan = defaultPlan;

    const rawBrackets = plan?.bracketsJson;
    const parsed = parseBrackets(rawBrackets);
    const hit = match(parsed, cashCollected);

    problems.push({
      shiftId: s.id,
      waiterId: s.employeeId,
      waiterName: emp?.name ?? null,
      date: s.date.toISOString().slice(0,10),
      cashCollected,
      planId: plan?.id ?? null,
      rawBracketsPreview: (Array.isArray(rawBrackets) ? rawBrackets.slice(0,6) : String(rawBrackets)).slice ? (Array.isArray(rawBrackets) ? rawBrackets.slice(0,6) : String(rawBrackets).slice(0,500)) : String(rawBrackets),
      parsedBrackets: parsed,
      matchedBracket: hit
    });
  }

  console.log(JSON.stringify({ checkedMonth: `${year}-${String(month).padStart(2,'0')}`, defaultPlanId: defaultPlan?.id ?? null, problems }, null, 2));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
