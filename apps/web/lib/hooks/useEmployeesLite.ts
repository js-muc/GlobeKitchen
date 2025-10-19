// LABEL: HOOK_EMPLOYEES_LITE_V1
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type EmployeeLite = {
  id: number;
  name: string;
  role?: string | null;
  type?: string | null;
  tableCode?: string | null;
};

function normalizeEmployees(data: any): EmployeeLite[] {
  const arr = Array.isArray(data?.employees)
    ? data.employees
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : [];
  return arr.map((e: any) => ({
    id: Number(e.id),
    name: String(e.name ?? ""),
    role: e.role ?? null,
    type: e.type ?? null,
    tableCode: e.tableCode ?? null,
  }));
}

export function useEmployeesLite(search: string) {
  return useQuery({
    queryKey: ["employees-lite", search],
    queryFn: async () => {
      // server supports /employees?page/limit/q (we normalize shapes)
      const { data } = await api.get("/employees", {
        params: { page: 1, limit: 50, q: search?.trim() || undefined },
      });
      return normalizeEmployees(data);
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev ?? [],
  });
}
