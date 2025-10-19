// ✅ useEmployeesIndex — cache small (id -> name) map for labels
"use client";

import { useQuery } from "@tanstack/react-query";
import { listEmployees, type EmployeesResponse } from "@/lib/api";

export function useEmployeesIndex() {
  const q = useQuery<EmployeesResponse>({
    queryKey: ["employees-index"],
    // pull a decent amount once; cheap and cached
    queryFn: () => listEmployees({ page: 1, limit: 500 }),
    staleTime: 60_000,
  });

  const map = new Map<number, string>();
  if (q.data?.employees) {
    for (const e of q.data.employees) map.set(e.id, e.name);
  }

  return { map, isLoading: q.isLoading, error: q.error };
}
