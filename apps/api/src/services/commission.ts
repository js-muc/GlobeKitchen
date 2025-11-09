import { PrismaClient, CommissionRole } from "@prisma/client";

type Bracket = {
  min: number;         // inclusive
  max?: number | null; // optional
  ratePct?: number;    // percent, e.g. 5 for 5%
  flat?: number;       // optional flat add
};

// Pick the bracket where amount falls in [min, max?]
function pickBracket(amount: number, brackets: Bracket[]): Bracket | null {
  let best: Bracket | null = null;
  for (const b of brackets) {
    const okMin = amount >= (b.min ?? 0);
    const okMax = b.max == null ? true : amount <= b.max;
    if (okMin && okMax) {
      if (!best || (b.min ?? 0) > (best.min ?? 0)) best = b; // choose highest min that matches
    }
  }
  return best;
}

export async function computeFieldCommission(
  prisma: PrismaClient,
  employeeId: number,
  grossSales: number
): Promise<{ commission: number; ratePct: number }> {
  if (grossSales <= 0) return { commission: 0, ratePct: 0 };

  // Get employee with attached plan; else default FIELD plan
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { commissionPlan: true },
  });

  let plan = emp?.commissionPlan;
  if (!plan) {
    plan = await prisma.commissionPlan.findFirst({
      where: { role: CommissionRole.FIELD, isDefault: true },
    });
  }

  if (!plan) return { commission: 0, ratePct: 0 };

  let brackets: Bracket[] = [];
  try {
    const json = plan.bracketsJson as any;
    if (Array.isArray(json)) {
      brackets = json.map((b) => ({
        min: Number(b.min ?? 0),
        max: b.max == null ? null : Number(b.max),
        ratePct: b.ratePct == null ? 0 : Number(b.ratePct),
        flat: b.flat == null ? 0 : Number(b.flat),
      }));
    }
  } catch {
    /* ignore – treat as no brackets */
  }

  const chosen = pickBracket(grossSales, brackets);
  const rate = chosen?.ratePct ?? 0;
  const flat = chosen?.flat ?? 0;
  const commission = Math.max(0, (grossSales * rate) / 100 + flat);
  return { commission, ratePct: rate };
}
