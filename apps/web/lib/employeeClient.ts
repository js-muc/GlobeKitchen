// apps/web/lib/employeeClient.ts
import { ENDPOINTS } from "./fieldEndpoints";

export type EmployeeLite = { id: number; name: string; role?: string; type?: string };

// Robust, paginated fetch that does NOT call /employee-list at all.
export async function fetchAllEmployees(
  api: { get<T = any>(path: string): Promise<T> },
  opts?: { type?: "FIELD" | "INSIDE" }
) {
  const out: EmployeeLite[] = [];
  let page = 1;
  const limit = 100; // large, safe

  for (let safety = 0; safety < 100; safety++) {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    const resp = await api.get<any>(`${ENDPOINTS.employeesPaged}?${qs.toString()}`);

    const data: any[] = Array.isArray(resp) ? resp : Array.isArray(resp?.data) ? resp.data : [];
    const meta = resp?.meta ?? {};

    for (const e of data) {
      out.push({
        id: Number(e.id),
        name: String(e.name ?? e.fullName ?? e.displayName ?? `#${e.id}`),
        role: e.role ?? undefined,
        type: e.type ?? e.waiterType ?? undefined,
      });
    }

    const hasNext = Boolean(meta?.hasNext) || (meta?.page && meta?.pages && meta.page < meta.pages);
    if (!hasNext || data.length === 0) break;
    page++;
  }

  return opts?.type ? out.filter(e => (e.type || "").toUpperCase() === opts.type) : out;
}
