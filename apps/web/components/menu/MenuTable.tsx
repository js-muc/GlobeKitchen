// File: apps/web/components/menu/MenuTable.tsx
// --------------------------------
import React from "react";
import type { MenuItem, MenuListMeta } from "@/lib/types/menu";
import { TableWrap, Th, Td } from "@/components/ui/Table";

export function MenuTable({
  loading,
  fetching, // reserved for future subtle loading states
  items,
  meta,
  page,
  onPageChange,
  onEdit,
  onDelete,
}: {
  loading: boolean;
  fetching: boolean;
  items: MenuItem[];
  meta?: MenuListMeta;
  page: number;
  onPageChange: (p: number) => void;
  onEdit: (item: MenuItem) => React.ReactNode;
  onDelete: (item: MenuItem) => React.ReactNode;
}) {
  const cols = 6;

  return (
    <TableWrap>
      {/* Keep table *inside* TableWrap to avoid thead/tbody under a div (hydration fix) */}
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Menu items</caption>

        <thead className="bg-muted/40 sticky top-0 z-10">
          <tr>
            <Th>Name</Th>
            <Th>Category</Th>
            <Th>Unit</Th>
            <Th>Price</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            // Valid rows during loading (no stray text nodes)
            Array.from({ length: 3 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                <td colSpan={cols} className="p-0">
                  <div className="h-10 w-full animate-pulse rounded bg-muted/60" />
                </td>
              </tr>
            ))
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={cols} className="py-8 text-center text-sm text-muted-foreground">
                No items found.
              </td>
            </tr>
          ) : (
            items.map((it) => (
              <tr key={it.id}>
                <Td className="font-medium">{it.name}</Td>
                <Td>{it.category}</Td>
                <Td>{it.unit}</Td>
                <Td>KES {Number(it.priceSell).toFixed(2)}</Td>
                <Td>
                  <span
                    className={`inline-flex h-6 items-center rounded-full px-2 text-xs ${
                      it.active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {it.active ? "Active" : "Inactive"}
                  </span>
                </Td>
                <Td className="text-right">
                  <div className="inline-flex gap-2">
                    {onEdit(it)}
                    {onDelete(it)}
                  </div>
                </Td>
              </tr>
            ))
          )}

          {/* Divider row (valid HTML) */}
          <tr aria-hidden="true">
            <td colSpan={cols} className="p-0">
              <div className="h-px w-full bg-border" />
            </td>
          </tr>
        </tbody>
      </table>
    </TableWrap>
  );
}
