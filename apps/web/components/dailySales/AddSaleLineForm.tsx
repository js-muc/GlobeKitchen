// C:\GlobeKitchen\apps\web\components\dailySales\AddSaleLineForm.tsx
"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ItemSelect from "./ItemSelect";
// IMPORTANT: match ItemSelect’s ItemLite source to avoid incompatible types
import type { ItemLite } from "@/lib/hooks/useMenuItems";
import { parseError } from "@/lib/api";

// Import the module namespace so we can support both old & new API shapes.
import * as SalesApi from "@/lib/api.sales";

type Props = {
  shiftId: number;
  onAdded?: () => void;
};

// Unified input + return types for add-line
type AddLineInput = {
  shiftId: number;
  itemId: number;
  qty: number;
  unitPrice: number;
  unit?: string;
  note?: string;
};
type AddLineResult = { ok: boolean; line: any; shift?: any };

/**
 * Wrapper that calls the correct API shape:
 * - Preferred: addSaleLine({shiftId, itemId, ...})
 * - Legacy:    addShiftLine(shiftId, { itemId, ... })
 */
async function addLine(body: AddLineInput): Promise<AddLineResult> {
  const mod = SalesApi as any;

  if (typeof mod.addSaleLine === "function") {
    return mod.addSaleLine(body) as Promise<AddLineResult>;
  }

  if (typeof mod.addShiftLine === "function") {
    const { shiftId, ...payload } = body;
    return mod.addShiftLine(shiftId, payload) as Promise<AddLineResult>;
  }

  throw new Error("Sales API add-line function not found (addSaleLine/addShiftLine).");
}

export default function AddSaleLineForm({ shiftId, onAdded }: Props) {
  const qc = useQueryClient();
  const [item, setItem] = React.useState<ItemLite | null>(null);
  const [qty, setQty] = React.useState<number>(1);
  const [unitPrice, setUnitPrice] = React.useState<number>(0);
  const [unit, setUnit] = React.useState<string>("unit"); // default "unit" to match BE data
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
      const itemIdNum = Number((item as any).id);
      if (!Number.isFinite(itemIdNum) || itemIdNum <= 0) {
        throw new Error("Invalid item selected.");
      }
      const body: AddLineInput = {
        shiftId,
        itemId: itemIdNum, // ensure number for BE validation
        qty: Number(qty),
        unitPrice: Number(unitPrice),
        unit: unit || "unit",
        note: note?.trim() || undefined,
      };

      // Call the correct API shape via the wrapper.
      const res = await addLine(body);
      return res; // { ok, line, shift? }
    },
    onSuccess: (res) => {
      // Prefer the shift actually used on the server (may be reopened/new)
      const serverShiftId: number = Number(res?.shift?.id ?? shiftId) || shiftId;

      // Invalidate the lines/summary for BOTH the old and new shift IDs
      for (const id of new Set([shiftId, serverShiftId])) {
        qc.invalidateQueries({ queryKey: ["shift-lines", id] });
        qc.invalidateQueries({ queryKey: ["daily-sales", "summary", id] });
        qc.invalidateQueries({ queryKey: ["shift", id] });
      }

      // Also refresh "today" group list + daily rollup if used in UI
      qc.invalidateQueries({ queryKey: ["daily-sales", "today"] });
      qc.invalidateQueries({ queryKey: ["daily-sales", "rollup"] });

      // Notify any listeners (page/header) that active shift may have changed
      if (typeof window !== "undefined" && serverShiftId !== shiftId) {
        window.dispatchEvent(
          new CustomEvent("daily-sales:active-shift-changed", {
            detail: { shiftId: serverShiftId, fromShiftId: shiftId },
          })
        );
      }

      // reset for next line; keep UX identical
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
    !!item &&
    Number.isFinite(Number(item?.id)) &&
    Number(item?.id) > 0 &&
    Number.isFinite(qty) &&
    qty > 0 &&
    Number.isFinite(unitPrice) &&
    unitPrice >= 0 &&
    (unit || "").trim().length > 0 &&
    Number.isFinite(shiftId) &&
    shiftId > 0;

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
          min={0.01}
          step="0.01"            // allow decimals (matches BE Decimal)
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
