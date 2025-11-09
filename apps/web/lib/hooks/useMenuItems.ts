// apps/web/lib/hooks/useMenuItems.ts
// LABEL: HOOKS_USE_MENU_ITEMS_V2
"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ItemLite = {
  id: number;
  name: string;
  unit?: string | null;
  priceSell: number | string; // keep tolerant; form converts to number
};

function normalizeRow(row: any): ItemLite {
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

/** Load a big (but cached) catalog for lookups/datalists */
export function useMenuItems(limit = 5000) {
  return useQuery<ItemLite[]>({
    queryKey: ["menu-items", "catalog", limit],
    queryFn: async () => {
      const res = await api.get("/items", { params: { limit } });
      const rows = Array.isArray(res.data?.data) ? res.data.data : res.data;
      return (rows ?? []).map(normalizeRow);
    },
    staleTime: 5 * 60 * 1000,
  });
}
