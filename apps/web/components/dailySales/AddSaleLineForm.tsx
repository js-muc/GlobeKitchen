"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ItemSelect from "./ItemSelect";
// IMPORTANT: match ItemSelect’s ItemLite source to avoid incompatible types
import type { ItemLite } from "@/lib/hooks/useMenuItems";
import { api, parseError } from "@/lib/api";

type Props = {
  shiftId: number;
  onAdded?: () => void;
};

export default function AddSaleLineForm({ shiftId, onAdded }: Props) {
  const qc = useQueryClient();
  const [item, setItem] = React.useState<ItemLite | null>(null);
  const [qty, setQty] = React.useState<number>(1);
  const [unitPrice, setUnitPrice] = React.useState<number>(0);
  const [unit, setUnit] = React.useState<string>("unit");
  const [note, setNote] = React.useState<string>("");

  // When item changes, prefill price & unit
  React.useEffect(() => {
    if (!item) return;
    const price =
      typeof item.priceSell === "string"
        ? Number(item.priceSell)
        : typeof item.priceSell === "number"
        ? item.priceSell
        : 0;
    if (Number.isFinite(price)) setUnitPrice(price);
    if (item.unit) setUnit(item.unit);
  }, [item]);

  const m = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("Pick an item first.");
      const body = {
        shiftId,
        itemId: item.id,
        qty: Number(qty),
        unitPrice: Number(unitPrice),
        unit: unit || "unit",
        note: note?.trim() || undefined,
      };
      const { data } = await api.post("/daily-sales/lines", body);
      return data;
    },
    onSuccess: () => {
      // refresh shift lines if you query them by key
      qc.invalidateQueries({ queryKey: ["shift-lines", shiftId] });
      setItem(null);
      setQty(1);
      setUnitPrice(0);
      setUnit("unit");
      setNote("");
      onAdded?.();
    },
    onError: (err: any) => {
      alert(parseError(err, "Failed to add sale line"));
    },
  });

  const canSubmit =
    !!item && Number.isFinite(qty) && qty > 0 && Number.isFinite(unitPrice) && unitPrice >= 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) m.mutate();
      }}
      className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3 items-end"
    >
      {/* Item */}
      <label className="grid gap-1">
        <span className="text-sm font-medium">Item</span>
        <ItemSelect value={item} onChange={(v) => setItem(v)} />
      </label>

      {/* Qty */}
      <label className="grid gap-1">
        <span className="text-sm font-medium">Qty</span>
        <input
          type="number"
          min={1}
          step={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="rounded-xl border px-3 py-2"
          required
        />
      </label>

      {/* Price */}
      <label className="grid gap-1">
        <span className="text-sm font-medium">Unit Price</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={Number.isFinite(unitPrice) ? unitPrice : 0}
          onChange={(e) => setUnitPrice(Number(e.target.value))}
          className="rounded-xl border px-3 py-2"
          required
        />
      </label>

      {/* Unit + Note */}
      <div className="grid grid-cols-2 gap-3 sm:col-span-3">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Unit</span>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="rounded-xl border px-3 py-2"
            placeholder="plate / cup / unit"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Note (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-xl border px-3 py-2"
            placeholder="e.g., no sugar"
          />
        </label>
      </div>

      <div className="sm:col-span-3 flex justify-end">
        <button
          type="submit"
          className="rounded-xl bg-brand px-4 py-2 text-white font-medium hover:brightness-110 disabled:opacity-50"
          disabled={m.isPending || !canSubmit}
          aria-busy={m.isPending}
        >
          {m.isPending ? "Adding…" : "Add line & Print"}
        </button>
      </div>
    </form>
  );
}
