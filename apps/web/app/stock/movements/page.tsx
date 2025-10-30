// apps/web/app/stock/movements/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { listMovements } from "@/lib/stockApi";
import MovementsTable, { MovRow } from "@/components/MovementsTable";

export default function MovementsPage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const itemIdParam = search?.get("itemId") ?? "";
  const itemId = itemIdParam ? Number(itemIdParam) : NaN;

  const [rows, setRows] = useState<MovRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(itemId)) {
      setError("Missing or invalid itemId in query string.");
      setRows([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await listMovements({ itemId, page: 1, limit: 200, signal: controller.signal });
        const raw = (res as any)?.data ?? res;
        let list: any[] = Array.isArray(raw) ? raw : [];
        if (!Array.isArray(list)) {
          if (Array.isArray((res as any)?.data)) list = (res as any).data;
          else if (Array.isArray((res as any)?.rows)) list = (res as any).rows;
          else list = [];
        }
        if (cancelled) return;
        const mapped: MovRow[] = list.map((m: any) => ({
          id: Number(m.id),
          itemId: Number(m.itemId ?? m.item_id ?? m.item?.id),
          direction: (m.direction ?? "IN") as "IN" | "OUT",
          quantity: Number(m.quantity ?? m.qty ?? 0),
          unitCost: m.unitCost ?? m.unit_cost ?? null,
          note: m.note ?? null,
          createdAt: m.createdAt ?? m.created_at ?? new Date().toISOString(),
          item: m.item ? { name: m.item.name, unit: m.item.unit } : undefined,
        }));
        setRows(mapped);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          console.debug("movements fetch aborted");
        } else {
          console.error("Failed to load movements", err);
          const msg = err?.body?.message ?? err?.message ?? JSON.stringify(err);
          setError(String(msg));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [itemId]);

  // Refresh uses pathname + search params to rebuild URL correctly in App Router
  function handleRefresh() {
    const qs = search?.toString() ?? "";
    const href = qs ? `${pathname}?${qs}` : pathname;
    // router.replace takes the href and re-runs rendering/loading
    router.replace(href);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Movements</h1>
          <div className="text-sm text-muted-foreground mt-1">Item ID: {itemIdParam}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.back()} className="px-3 py-1 border rounded text-sm">Back</button>
          <button onClick={handleRefresh} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Refresh</button>
        </div>
      </div>

      <MovementsTable
        rows={rows}
        loading={loading}
        error={error}
        onRefresh={handleRefresh}
        showHeader={false}
        emptyMessage="No movements for this item."
      />
    </div>
  );
}
