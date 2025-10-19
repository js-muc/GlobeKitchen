"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serverUrl } from "@/lib/config";

type DailySale = {
  id: number;
  date: string;
  itemId: number;
  qty: number;
  unitPrice: number;
  total: number;
  note: string | null;
  createdAt: string;
};

type Page<T> = {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number; hasNext: boolean; hasPrev: boolean };
};

export function useDailySales(params: { date?: string; page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  ).toString();
  const url = serverUrl("daily-sales" + (qs ? `?${qs}` : ""));

  return useQuery<Page<DailySale>>({
    queryKey: ["daily-sales", params],
    queryFn: async () => {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to fetch daily sales");
      return r.json();
    },
  });
}

/** Variables type for create mutation */
type CreateDailySaleInput = {
  date: string;
  itemId: number;
  qty: number;
  unitPrice: number;
  unit?: string;
  note?: string | null;
};

export function useCreateDailySale() {
  const qc = useQueryClient();

  return useMutation<DailySale, Error, CreateDailySaleInput>({
    mutationFn: async (input) => {
      const body: CreateDailySaleInput = { ...input, unit: input.unit ?? "unit" };
      const r = await fetch(serverUrl("daily-sales"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.text();
        throw new Error(err || "Failed to create sale");
      }
      return r.json() as Promise<DailySale>;
    },
    onSuccess: (_row, vars) => {
      // broad invalidation
      qc.invalidateQueries({ queryKey: ["daily-sales"] });
      // targeted invalidation by date (matches the queryKey convention above)
      if (vars?.date) {
        qc.invalidateQueries({ queryKey: ["daily-sales", { date: vars.date }] });
      }
    },
  });
}
