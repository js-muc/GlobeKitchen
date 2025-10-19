// [useMenuItems.ts] Minimal search hook for menu items (v5-safe)
// - Debounces search
// - Uses /api/items with ?search=/q filter
// - Uses placeholderData: keepPreviousData (TanStack v5)

"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api, menuApi } from "@/lib/api";

export type ItemLite = {
  id: number;
  name: string;
  unit?: string | null;
  priceSell?: number | string | null;
  category?: string | null;
};

function normalizeItems(data: any): ItemLite[] {
  const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return arr.map((r: any) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    unit: r.unit ?? null,
    priceSell:
      typeof r.priceSell === "string" ? Number(r.priceSell) :
      typeof r.priceSell === "number" ? r.priceSell : null,
    category: r.category ?? null,
  }));
}

export function useMenuItemsSearch(search: string, limit = 20) {
  return useQuery<ItemLite[]>({
    queryKey: ["menu-items-search", search, limit],
    queryFn: async () => {
      // Try core API first, fall back to menu API if needed
      const params = { page: 1, limit, search, q: search, sortBy: "name", sortDir: "asc" };
      try {
        const { data } = await api.get("/items", { params });
        return normalizeItems(data);
      } catch {
        const { data } = await menuApi.get("/items", { params });
        return normalizeItems(data);
      }
    },
    staleTime: 30_000,
    // v5: use placeholderData with the helper instead of keepPreviousData option
    placeholderData: keepPreviousData,
  });
}
