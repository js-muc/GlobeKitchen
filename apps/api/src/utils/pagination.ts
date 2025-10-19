// apps/api/src/utils/pagination.ts

export type PageParams = {
  page: number;
  limit: number;
  skip: number;
  take: number;
};

export type PageMeta = {
  total: number;
  page: number;
  limit: number; // ← normalized key (do not return pageSize)
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * Parse pagination params from a query object.
 * - Accepts `pageSize` as input alias to `limit`
 * - Clamps to sane defaults and max
 * - Returns skip/take for Prisma
 */
export function getPageParams(
  q: any,
  opts?: { defaultLimit?: number; maxLimit?: number }
): PageParams {
  const defaultLimit = opts?.defaultLimit ?? 20;
  const maxLimit = opts?.maxLimit ?? 100;

  const rawPage = q?.page ?? 1;
  const rawLimit = q?.pageSize ?? q?.limit ?? defaultLimit; // alias allowed in INPUT only

  const page = Math.max(1, parseInt(String(rawPage), 10) || 1);

  let limit = parseInt(String(rawLimit), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const skip = (page - 1) * limit;
  const take = limit;

  return { page, limit, skip, take };
}

/**
 * Build pagination metadata for responses.
 * - Uses `limit` (no `pageSize` in meta)
 */
export function pageMeta(total: number, page: number, limit: number): PageMeta {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return {
    total,
    page,
    limit,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}
