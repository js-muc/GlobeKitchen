// apps/web/components/dailySales/ItemSelect.tsx
// LABEL: COMPONENT_ITEM_SELECT_V2
"use client";

import * as React from "react";
import { useMenuItems } from "@/lib/hooks/useMenuItems";
import type { ItemLite } from "@/lib/hooks/useMenuItems";

type Props = {
  value: ItemLite | null;
  onChange: (v: ItemLite | null) => void;
  placeholder?: string;
};

export default function ItemSelect({ value, onChange, placeholder }: Props) {
  const { data: items = [], isLoading } = useMenuItems(1000);

  return (
    <div className="relative">
      <input
        list="items-catalog"
        className="w-full rounded-xl border px-3 py-2 bg-background"
        placeholder={placeholder ?? (isLoading ? "Loading items…" : "type to search…")}
        value={value ? `${value.name} (#${value.id})` : ""}
        onChange={(e) => {
          const v = e.target.value;
          const match = items.find(
            (it) => `${it.name} (#${it.id})` === v || it.name === v
          );
          onChange(match ?? null);
        }}
      />
      <datalist id="items-catalog">
        {items.map((it) => (
          <option key={it.id} value={`${it.name} (#${it.id})`} />
        ))}
      </datalist>
    </div>
  );
}
