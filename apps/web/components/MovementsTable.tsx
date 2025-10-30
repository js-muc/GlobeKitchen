// apps/web/components/MovementsTable.tsx
"use client";

import React from "react";

export type MovRow = {
  id: number;
  itemId: number;
  direction: "IN" | "OUT";
  quantity: number;
  unitCost?: number | string | null;
  note?: string | null;
  createdAt: string;
  item?: { name?: string; unit?: string };
};

type Props = {
  rows: MovRow[];
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
  onRefresh?: () => void;
  showHeader?: boolean;
  emptyMessage?: string;
};

export default function MovementsTable({
  rows,
  loading = false,
  error = null,
  compact = false,
  onRefresh,
  showHeader = true,
  emptyMessage = "No movements to show.",
}: Props) {
  const cellPadding = compact ? "p-2 text-sm" : "p-2";
  const headerPadding = compact ? "p-2 text-xs" : "p-2 text-sm";

  return (
    <div className="w-full">
      {showHeader && (
        <div className="flex items-center justify-between mb-2">
          <h3 className={compact ? "text-sm font-medium" : "text-base font-medium"}>Movements</h3>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                aria-label="Refresh movements"
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded shadow-sm">
        {loading ? (
          <table className="w-full table-auto">
            <thead>
              <tr className="text-left">
                <th className={headerPadding}>Date</th>
                <th className={headerPadding}>Direction</th>
                <th className={headerPadding}>Quantity</th>
                <th className={headerPadding}>Unit Cost</th>
                <th className={headerPadding}>Note</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t">
                  <td className={cellPadding}><div className="h-4 w-32 bg-gray-100 rounded animate-pulse" /></td>
                  <td className={cellPadding}><div className="h-4 w-20 bg-gray-100 rounded animate-pulse" /></td>
                  <td className={cellPadding}><div className="h-4 w-12 bg-gray-100 rounded animate-pulse" /></td>
                  <td className={cellPadding}><div className="h-4 w-16 bg-gray-100 rounded animate-pulse" /></td>
                  <td className={cellPadding}><div className="h-4 w-48 bg-gray-100 rounded animate-pulse" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : error ? (
          <div className="p-4 text-sm text-red-700">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          <table className="w-full table-auto">
            <thead>
              <tr className="text-left">
                <th className={headerPadding}>Date</th>
                <th className={headerPadding}>Direction</th>
                <th className={headerPadding}>Quantity</th>
                <th className={headerPadding}>Unit Cost</th>
                <th className={headerPadding}>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className={cellPadding + " text-sm"}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td className={cellPadding + " text-sm"}>{r.direction}</td>
                  <td className={cellPadding + " text-sm"}>{Number(r.quantity).toFixed(1)}</td>
                  <td className={cellPadding + " text-sm"}>{r.unitCost != null ? String(r.unitCost) : "-"}</td>
                  <td className={cellPadding + " text-sm break-words max-w-xs"}>{r.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
