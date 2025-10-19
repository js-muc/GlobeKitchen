// apps/api/src/routes/_payroll.util.ts
export function moneyStr(v: any): string | null {
  // preserve original: null/undefined stay null
  if (v == null) return null;

  // Prisma.Decimal (and similar) expose toFixed
  if (typeof v === "object" && typeof (v as any).toFixed === "function") {
    return (v as any).toFixed(2);
  }

  // If it's a numeric or numeric string, normalize to 2dp
  const n = Number(v);
  if (Number.isFinite(n)) return n.toFixed(2);

  // Fallback: stringify as-is (rare for money fields)
  return String(v);
}

export function getPageParams(q: any) {
  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const raw = q.limit ?? q.pageSize ?? 20;
  const limit = Math.min(100, Math.max(1, Number(raw) || 20));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function pageMeta(total: number, page: number, limit: number) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return { total, page, limit, pages, hasNext: page < pages, hasPrev: page > 1 };
}
