// apps/web/lib/hooks/useMenuItemsSearch.ts
// LABEL: HOOKS_USE_MENU_ITEMS_SEARCH_V2
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
export type { ItemLite } from "./useMenuItems";

function normalizeRow(row: any) {
  return {
    id: Number(row.id),
    name: row.name ?? row.title ?? `Item #${row.id}`,
    unit: row.unit ?? row.defaultUnit ?? null,
    priceSell:
      typeof row.priceSell === "number"
        ? row.priceSell
        : typeof row.price === "number"
        ? row.price
        : Number(row.priceSell ?? row.price ?? 0),
  };
}

/** Server-side filtering if BE supports q=; else client-side fallback is handled by UI */
export function useMenuItemsSearch(q: string, limit = 100) {
  return useQuery({
    queryKey: ["menu-items", "search", q, limit],
    queryFn: async () => {
      const params: Record<string, any> = { limit };
      if (q && q.trim().length > 0) params.q = q.trim();
      const res = await api.get("/items", { params });
      const rows = Array.isArray(res.data?.data) ? res.data.data : res.data;
      const list = (rows ?? []).map(normalizeRow);
      // If server didn’t implement q, do a gentle client-side filter:
      if (!params.q) return list;
      const needle = params.q.toLowerCase();
      return list.filter((x: any) => String(x.name || "").toLowerCase().includes(needle));
    },
    staleTime: 30_000,
  });
}
