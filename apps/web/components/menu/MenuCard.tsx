// File: apps/web/components/menu/MenuCard.tsx
// --------------------------------
import React from "react";
import type { MenuItem } from "@/lib/types/menu";

function formatDateUTC(iso: string) {
  // Stable across SSR/CSR: YYYY-MM-DD in UTC
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function MenuCard({
  item,
  editButton,
  deleteButton,
}: {
  item: MenuItem;
  editButton: React.ReactNode;
  deleteButton: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-base">{item.name}</div>
          <div className="text-sm opacity-70">
            {item.category} · {item.unit}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold">
            KES {Number(item.priceSell).toFixed(2)}
          </div>
          <div className="text-xs opacity-60">{formatDateUTC(item.createdAt)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span
          className={`inline-flex h-6 items-center rounded-full px-2 text-xs ${
            item.active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-rose-100 text-rose-700"
          }`}
        >
          {item.active ? "Active" : "Inactive"}
        </span>
        <div className="flex items-center gap-2">
          {editButton}
          {deleteButton}
        </div>
      </div>
    </div>
  );
}
