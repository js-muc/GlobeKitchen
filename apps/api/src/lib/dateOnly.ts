// apps/api/src/lib/dateOnly.ts
export function dateOnlyUTCFromYMD(ymd: string) {
  // ymd = "YYYY-MM-DD"
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)); // always UTC midnight
}
