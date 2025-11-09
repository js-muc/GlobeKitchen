// apps/web/components/MovementModal.tsx
"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { createMovement, listInventory, createItem, listMovements } from "@/lib/stockApi";
import MovementsTable, { MovRow } from "@/components/MovementsTable";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultItemId?: number | null;
  onCreated?: () => void;
};

type MaterialItem = {
  id: number;
  name: string;
  unit?: string | null;
  currentStock: number;
  category?: string | null;
  reorderLevel?: number | null;
};

function formatServerError(err: any) {
  if (!err) return "Request failed";
  if (typeof err === "string") return err;
  if (err?.body) {
    const b = err.body;
    if (b.fieldErrors) {
      const parts: string[] = [];
      for (const k of Object.keys(b.fieldErrors)) {
        const arr = Array.isArray(b.fieldErrors[k]) ? b.fieldErrors[k] : [String(b.fieldErrors[k])];
        parts.push(`${k}: ${arr.join("; ")}`);
      }
      return parts.join(" · ");
    }
    if (b.formErrors && Array.isArray(b.formErrors) && b.formErrors.length) {
      return b.formErrors.join(" · ");
    }
    if (b.error) return String(b.error);
    if (b.message) return String(b.message);
    return JSON.stringify(b);
  }
  if (err.message) return String(err.message);
  return String(err);
}

export default function MovementModal({ open, onClose, defaultItemId, onCreated }: Props) {
  // ---------- hooks (stable order) ----------
  const [itemId, setItemId] = useState<string>(defaultItemId ? String(defaultItemId) : "");
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);

  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [quantity, setQuantity] = useState<string>(""); // decimals allowed
  const [unitCost, setUnitCost] = useState<string>(""); // optional
  const [note, setNote] = useState<string>(""); // optional note
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [addingNew, setAddingNew] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>("");
  const [newUnit, setNewUnit] = useState<string>("");
  const [newStartingQty, setNewStartingQty] = useState<string>("");

  // recent movements for selected item (shown in modal)
  const [movements, setMovements] = useState<MovRow[]>([]);
  const [loadingMovements, setLoadingMovements] = useState<boolean>(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  // sync defaultItemId
  useEffect(() => {
    setItemId(defaultItemId ? String(defaultItemId) : "");
    if (defaultItemId) {
      const found = items.find((i) => i.id === Number(defaultItemId));
      if (found) setSearchTerm(found.name);
    }
  }, [defaultItemId, items]);

  // load materials when modal opens
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadMaterials() {
      if (!open) return;
      setLoadingItems(true);
      setLoadError(null);

      try {
        const res = await listInventory({ page: 1, limit: 200, category: "Materials", signal: controller.signal });
        const raw = (res && (res as any).data) ? (res as any).data : res;
        let list: any[] = [];

        if (Array.isArray(raw)) list = raw;
        else if (Array.isArray(raw?.data)) list = raw.data;
        else if (Array.isArray(raw?.rows)) list = raw.rows;
        else if (Array.isArray(raw?.items)) list = raw.items;
        else {
          const candidate = Object.values(raw ?? {}).find((v) => Array.isArray(v)) as any[] | undefined;
          if (candidate) list = candidate;
          else {
            list = [];
            throw raw ?? new Error("Unexpected inventory payload shape");
          }
        }

        if (cancelled) return;

        const normalized = list.map((r: any) => {
          const id = Number(r.id ?? r.itemId ?? r.item_id);
          const name = String(r.name ?? r.title ?? r.itemName ?? "Unnamed");
          const currentStockRaw = r.currentStock ?? r.current_qty ?? r.current ?? r.qty ?? r.quantity ?? 0;
          const currentStock = typeof currentStockRaw === "string" ? parseFloat(currentStockRaw) : Number(currentStockRaw ?? 0);
          const unit = r.unit ?? r.unitName ?? null;
          const reorderLevel = r.reorderLevel ?? r.reorder_level ?? null;
          return {
            id: Number.isFinite(id) ? id : NaN,
            name,
            unit,
            category: r.category ?? r.type ?? null,
            reorderLevel,
            currentStock: Number.isFinite(currentStock) ? Math.round(currentStock * 10) / 10 : 0,
          } as MaterialItem;
        });

        setItems(normalized);

        if (defaultItemId) {
          const found = normalized.find((i) => i.id === Number(defaultItemId));
          if (found) setSearchTerm(found.name);
        }
      } catch (err: any) {
        if (!cancelled) {
          if (err?.name === "AbortError") {
            console.debug("loadMaterials aborted");
          } else {
            console.error("Failed to load materials", err ?? {});
            setLoadError(formatServerError(err));
          }
        }
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    }

    loadMaterials();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, defaultItemId]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!suggestionsRef.current) return;
      if (!suggestionsRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // derived values
  const selectedItem = useMemo(() => {
    const idNum = Number(itemId);
    if (!Number.isFinite(idNum)) return null;
    return items.find((it) => it.id === idNum) ?? null;
  }, [items, itemId]);

  const quantityNum = useMemo(() => {
    const q = parseFloat(quantity);
    return Number.isFinite(q) && q > 0 ? Math.round(q * 10) / 10 : 0;
  }, [quantity]);

  const remainingPreview = useMemo(() => {
    if (!selectedItem) return null;
    return direction === "IN" ? Math.round((selectedItem.currentStock + quantityNum) * 10) / 10 : Math.round((selectedItem.currentStock - quantityNum) * 10) / 10;
  }, [selectedItem, direction, quantityNum]);

  const lowStock = useMemo(() => {
    if (!selectedItem || remainingPreview === null) return false;
    if (typeof selectedItem.reorderLevel === "number") return remainingPreview <= selectedItem.reorderLevel;
    return remainingPreview <= 5;
  }, [selectedItem, remainingPreview]);

  const suggestedPurchaseQty = useMemo(() => {
    if (!selectedItem || remainingPreview === null) return null;
    if (typeof selectedItem.reorderLevel === "number") {
      const want = Math.max((selectedItem.reorderLevel ?? 0) * 2 - remainingPreview, 1);
      return Number.isFinite(want) ? Math.round(want * 10) / 10 : 1;
    }
    const want = Math.max(10 - remainingPreview, 1);
    return Number.isFinite(want) ? Math.round(want * 10) / 10 : 1;
  }, [selectedItem, remainingPreview]);

  const suggestions = useMemo(() => {
    if (!searchTerm) return items.slice(0, 10);
    const q = searchTerm.trim().toLowerCase();
    return items.filter((it) => it.name.toLowerCase().includes(q) || String(it.id).includes(q)).slice(0, 15);
  }, [items, searchTerm]);

  function chooseSuggestion(it: MaterialItem) {
    setItemId(String(it.id));
    setSearchTerm(it.name);
    setShowSuggestions(false);
  }

  // fetch recent movements for selected item (compact)
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadMovements() {
      if (!selectedItem) {
        setMovements([]);
        setMovementsError(null);
        return;
      }
      setLoadingMovements(true);
      setMovementsError(null);
      try {
        const res = await listMovements({ itemId: selectedItem.id, page: 1, limit: 10, signal: controller.signal });
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
          itemId: Number(m.itemId ?? m.item_id ?? m.item?.id ?? selectedItem.id),
          direction: (m.direction ?? "IN") as "IN" | "OUT",
          quantity: Number(m.quantity ?? m.qty ?? 0),
          unitCost: m.unitCost ?? m.unit_cost ?? null,
          note: m.note ?? null,
          createdAt: m.createdAt ?? m.created_at ?? new Date().toISOString(),
          item: m.item ? { name: m.item.name, unit: m.item.unit } : undefined,
        }));
        setMovements(mapped);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          console.debug("movements fetch aborted");
        } else {
          console.error("Failed to load movements", err);
          setMovementsError(formatServerError(err));
        }
      } finally {
        if (!cancelled) setLoadingMovements(false);
      }
    }

    loadMovements();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedItem]);

  // create new material flow (keeps duplicate handling)
  async function createNewMaterial() {
    setError(null);
    setInfoMessage(null);

    if (!newName.trim()) {
      setError("Material name is required.");
      return;
    }
    const startingQtyNum = newStartingQty ? parseFloat(newStartingQty) : 0;
    if (newStartingQty && (!Number.isFinite(startingQtyNum) || startingQtyNum < 0)) {
      setError("Starting quantity must be a non-negative number.");
      return;
    }

    setSaving(true);
    try {
      const created = await createItem({
        name: newName.trim(),
        unit: newUnit?.trim() || null,
        category: "Materials",
        startingQty: Number.isFinite(startingQtyNum) ? Math.round(startingQtyNum * 10) / 10 : undefined,
        priceSell: 0 as any,
      } as any);

      const createdId = (created && (created as any).id) ? (created as any).id : created ?? null;
      if (!createdId) throw new Error("Unexpected response from createItem");

      const createdNormalized: MaterialItem = {
        id: Number(createdId),
        name: String((created as any).name ?? newName.trim()),
        unit: (created as any).unit ?? newUnit ?? null,
        currentStock: Math.round((Number((created as any).currentStock ?? startingQtyNum ?? 0)) * 10) / 10,
        category: "Materials",
        reorderLevel: (created as any).reorderLevel ?? null,
      };

      setItems((prev) => [createdNormalized, ...prev]);
      setItemId(String(createdNormalized.id));
      setSearchTerm(createdNormalized.name);
      setAddingNew(false);
      setNewName("");
      setNewUnit("");
      setNewStartingQty("");
      setInfoMessage("Material created — you can now record a movement for it.");
    } catch (err: any) {
      console.error("Failed to create material", err ?? {});
      const msg = formatServerError(err);
      const isDuplicate =
        (err && (err.message === "duplicate_item" || err.body?.error === "duplicate_item" || err.body?.message === "duplicate_item")) ||
        (typeof msg === "string" && msg.includes("duplicate_item"));

      if (isDuplicate) {
        try {
          const q = newName.trim();
          const lookup = await listInventory({ page: 1, limit: 50, q, category: "Materials" });
          const raw = (lookup as any)?.data ?? lookup;
          let list: any[] = Array.isArray(raw) ? raw : [];
          if (!Array.isArray(list)) {
            if (Array.isArray((lookup as any)?.data)) list = (lookup as any).data;
            else if (Array.isArray((lookup as any)?.rows)) list = (lookup as any).rows;
            else list = [];
          }

          const found = list.find((it: any) => {
            const name = String(it.name ?? it.title ?? it.itemName ?? "");
            return name.toLowerCase() === q.toLowerCase() || String(it.id) === q;
          });

          if (found) {
            const id = Number(found.id ?? found.itemId ?? found.item_id);
            const name = String(found.name ?? found.title ?? found.itemName ?? newName.trim());
            const unit = found.unit ?? found.unitName ?? null;
            const currentStockRaw = found.currentStock ?? found.current_qty ?? found.current ?? found.qty ?? found.quantity ?? 0;
            const currentStock = typeof currentStockRaw === "string" ? parseFloat(currentStockRaw) : Number(currentStockRaw ?? 0);

            const normalized: MaterialItem = {
              id: Number.isFinite(id) ? id : NaN,
              name,
              unit,
              currentStock: Number.isFinite(currentStock) ? Math.round(currentStock * 10) / 10 : 0,
              category: found.category ?? found.type ?? "Materials",
              reorderLevel: found.reorderLevel ?? found.reorder_level ?? null,
            };

            setItems((prev) => [normalized, ...prev.filter((p) => p.id !== normalized.id)]);
            setItemId(String(normalized.id));
            setSearchTerm(normalized.name);
            setAddingNew(false);
            setInfoMessage("Material already exists — selected existing item.");
            setError(null);
            return;
          } else {
            setError("Item already exists on the server (duplicate), but we couldn't locate it automatically. Try refreshing the list.");
          }
        } catch (lookupErr) {
          console.error("Lookup after duplicate failed", lookupErr);
          setError("Item already exists (duplicate). Refresh and try again.");
        } finally {
          setSaving(false);
        }
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  // submit movement
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    // If user typed an exact name but didn't click suggestion, attempt to auto-resolve
    if (!itemId && searchTerm?.trim()) {
      const q = searchTerm.trim();
      const found = items.find((it) => it.name.toLowerCase() === q.toLowerCase() || String(it.id) === q);
      if (found) {
        setItemId(String(found.id));
      }
    }

    const itemIdNum = Number(itemId);
    if (!Number.isFinite(itemIdNum) || (String(itemId || "").trim() === "")) {
      setError("Please select or create a valid material item (choose from suggestions or create it first).");
      return;
    }
    if (!quantityNum || quantityNum <= 0) {
      setError("Quantity must be a positive number (to 1 decimal place).");
      return;
    }
    if (direction === "OUT" && selectedItem && quantityNum > selectedItem.currentStock) {
      setError(`Insufficient stock. Current: ${selectedItem.currentStock}. You attempted to remove ${quantityNum}.`);
      return;
    }

    if (note.length > 300) {
      setError("Note must be 300 characters or fewer.");
      return;
    }

    const unitCostNum: number | undefined = unitCost === "" ? undefined : Number(unitCost);
    if (unitCostNum !== undefined && (!Number.isFinite(unitCostNum) || unitCostNum < 0)) {
      setError("Unit cost must be a non-negative number.");
      return;
    }

    setSaving(true);
    try {
      const payloadQty = Math.round(quantityNum * 10) / 10;
      const payload: any = { itemId: itemIdNum, direction, quantity: payloadQty };
      if (unitCostNum !== undefined) payload.unitCost = unitCostNum;
      const noteTrim = note.trim();
      if (noteTrim.length > 0) payload.note = noteTrim;

      await createMovement(payload);

      // Optimistically update local items list
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemIdNum ? { ...it, currentStock: Math.round(((direction === "IN" ? it.currentStock + payloadQty : it.currentStock - payloadQty)) * 10) / 10 } : it
        )
      );

      // refresh recent movements for the selected item
      try {
        setLoadingMovements(true);
        const res = await listMovements({ itemId: itemIdNum, page: 1, limit: 10 });
        const raw = (res as any)?.data ?? res;
        let list: any[] = Array.isArray(raw) ? raw : [];
        if (!Array.isArray(list)) {
          if (Array.isArray((res as any)?.data)) list = (res as any).data;
          else if (Array.isArray((res as any)?.rows)) list = (res as any).rows;
          else list = [];
        }
        const mapped: MovRow[] = list.map((m: any) => ({
          id: Number(m.id),
          itemId: Number(m.itemId ?? m.item_id ?? m.item?.id ?? itemIdNum),
          direction: (m.direction ?? "IN") as "IN" | "OUT",
          quantity: Number(m.quantity ?? m.qty ?? 0),
          unitCost: m.unitCost ?? m.unit_cost ?? null,
          note: m.note ?? null,
          createdAt: m.createdAt ?? m.created_at ?? new Date().toISOString(),
          item: m.item ? { name: m.item.name, unit: m.item.unit } : undefined,
        }));
        setMovements(mapped);
      } catch (e) {
        // ignore movement refresh error - user already has a success
      } finally {
        setLoadingMovements(false);
      }

      setInfoMessage("Movement created.");
      onCreated?.();

      setQuantity("");
      setUnitCost("");
      setNote("");
      if (!defaultItemId) {
        setItemId("");
        setSearchTerm("");
      }
    } catch (err: any) {
      console.error("Create movement failed", err);
      if (err?.status === 404) {
        setError("API route not found (404). Ensure the backend is running and /api/stock/movement exists on the server (port 4000). Check server logs.");
      } else {
        setError(formatServerError(err));
      }
    } finally {
      setSaving(false);
    }
  }

  // helper: try auto-resolve typed name to an id
  function tryAutoResolveItemId(): number | null {
    if (itemId && itemId.trim() !== "") return Number(itemId);
    const q = searchTerm?.trim();
    if (!q) return null;
    const found = items.find((it) => it.name.toLowerCase() === q.toLowerCase() || String(it.id) === q);
    if (found) return found.id;
    return null;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 px-4" role="dialog" aria-modal="true" aria-label="Create stock movement">
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-xl mx-auto z-10">
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Create Stock Movement (Materials)</h2>
              <p className="text-sm text-muted-foreground mt-1">Only raw materials are listed here — not menu items.</p>
            </div>

            <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700 ml-auto">✕</button>
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div ref={suggestionsRef}>
              <label className="block text-sm font-medium mb-1">Material</label>

              {loadError && (
                <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800 mb-2">
                  {loadError}
                </div>
              )}

              {loadingItems ? (
                <div className="text-sm text-muted-foreground">Loading materials…</div>
              ) : items.length === 0 && !addingNew ? (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">No materials found.</div>
                  <div className="flex gap-2">
                    <button type="button" className="px-3 py-1 bg-blue-600 text-white rounded text-sm" onClick={() => setAddingNew(true)} disabled={saving}>
                      Add material
                    </button>
                    <button type="button" className="px-3 py-1 bg-white border rounded text-sm" onClick={() => { setLoadError(null); setLoadingItems(true); setTimeout(() => setLoadingItems(false), 150); }} disabled={saving}>
                      Retry load
                    </button>
                  </div>
                </div>
              ) : addingNew ? (
                <div className="space-y-2 border rounded p-3 bg-gray-50">
                  <div>
                    <label className="block text-xs font-medium mb-1">Name</label>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input w-full" placeholder="e.g. Cooking Oil (Sunflower)" disabled={saving}/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Unit (optional)</label>
                    <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="input w-full" placeholder="e.g. litres, kg, pcs" disabled={saving}/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Starting quantity (optional)</label>
                    <input value={newStartingQty} onChange={(e) => setNewStartingQty(e.target.value)} className="input w-full" placeholder="e.g. 10 (litres)" disabled={saving}/>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" className="px-3 py-1 bg-white border rounded text-sm" onClick={() => { setAddingNew(false); setNewName(""); setNewUnit(""); setNewStartingQty(""); }} disabled={saving}>
                      Cancel
                    </button>
                    <button type="button" className="px-3 py-1 bg-green-600 text-white rounded text-sm" onClick={() => createNewMaterial()} disabled={saving}>
                      {saving ? "Creating..." : "Create material"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowSuggestions(true);
                      if (String(selectedItem?.id) !== e.target.value) setItemId("");
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="input w-full"
                    placeholder="Search by name or paste id..."
                    aria-autocomplete="list"
                    disabled={saving}
                  />

                  {showSuggestions && suggestions.length > 0 && (
                    <div className="border rounded mt-1 max-h-48 overflow-auto bg-white z-20">
                      {suggestions.map((it) => (
                        <button key={it.id} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-50" onClick={() => { chooseSuggestion(it); setItemId(String(it.id)); }} disabled={saving}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{it.name}</div>
                              <div className="text-xs text-muted-foreground">id:{it.id} • {it.unit ?? "unit"} • {it.currentStock}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-1 flex gap-2">
                    <button type="button" className="px-2 py-1 text-sm border rounded" onClick={() => setAddingNew(true)} disabled={saving}>Add new material</button>
                    <button type="button" className="px-2 py-1 text-sm border rounded" onClick={() => { setLoadError(null); setLoadingItems(true); setTimeout(() => setLoadingItems(false), 200); }} disabled={saving}>
                      Retry load
                    </button>
                  </div>
                </>
              )}

              <div className="mt-1 text-xs text-muted-foreground">Tip: type to search, or paste an item id (e.g. <code className="rounded bg-gray-100 px-1">12</code>) then Save.</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Direction</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value as "IN" | "OUT")} className="input w-full" disabled={saving}>
                  <option value="IN">IN (purchase / stock in)</option>
                  <option value="OUT">OUT (usage / stock out)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Quantity</label>
                <input required type="number" min={0} step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input w-full" placeholder="e.g. 5 or 0.5 (litres)" disabled={saving} />
                {selectedItem && (
                  <div className="mt-1 text-xs">
                    Current: <strong>{selectedItem.currentStock.toFixed(1)}</strong> {selectedItem.unit ? <span>({selectedItem.unit})</span> : null}
                    {remainingPreview !== null && <span className="ml-2">→ Remaining: <strong>{(remainingPreview as number).toFixed(1)}</strong></span>}
                  </div>
                )}
              </div>
            </div>

            {direction === "IN" && (
              <div>
                <label className="block text-sm font-medium mb-1">Unit Cost (optional)</label>
                <input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="input w-full" placeholder="e.g. 250.00" disabled={saving}/>
                <div className="mt-1 text-xs text-muted-foreground">Unit cost will be stored when provided (useful for valuation).</div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Note (optional)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} className="input w-full resize-none" placeholder="Short description (max 300 chars)" disabled={saving} />
              <div className="mt-1 text-xs text-muted-foreground">{note.length}/300</div>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}
            {infoMessage && <div className="text-sm text-green-700">{infoMessage}</div>}

            {selectedItem && remainingPreview !== null && lowStock && (
              <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">
                Warning: remaining stock (<strong>{(remainingPreview as number).toFixed(1)}</strong>) is low for <strong>{selectedItem.name}</strong>.
                {suggestedPurchaseQty !== null && (<div className="mt-1">Suggested purchase quantity (manual): <strong>{(suggestedPurchaseQty as number).toFixed(1)}</strong></div>)}
                <div className="mt-1 text-xs text-muted-foreground">This is a suggestion only — create a purchase order manually from the Purchases screen.</div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50" disabled={saving}>Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60">{saving ? "Saving..." : "Save movement"}</button>
            </div>
          </form>

          {/* Recent movements (compact) */}
          <div className="mt-4">
            <MovementsTable rows={movements} loading={loadingMovements} error={movementsError} compact onRefresh={() => {
              // reload movements
              if (!selectedItem) return;
              setLoadingMovements(true);
              setMovementsError(null);
              listMovements({ itemId: selectedItem.id, page: 1, limit: 10 })
                .then((res) => {
                  const raw = (res as any)?.data ?? res;
                  let list: any[] = Array.isArray(raw) ? raw : [];
                  if (!Array.isArray(list)) {
                    if (Array.isArray((res as any)?.data)) list = (res as any).data;
                    else if (Array.isArray((res as any)?.rows)) list = (res as any).rows;
                    else list = [];
                  }
                  const mapped: MovRow[] = list.map((m: any) => ({
                    id: Number(m.id),
                    itemId: Number(m.itemId ?? m.item_id ?? m.item?.id ?? selectedItem.id),
                    direction: (m.direction ?? "IN") as "IN" | "OUT",
                    quantity: Number(m.quantity ?? m.qty ?? 0),
                    unitCost: m.unitCost ?? m.unit_cost ?? null,
                    note: m.note ?? null,
                    createdAt: m.createdAt ?? m.created_at ?? new Date().toISOString(),
                    item: m.item ? { name: m.item.name, unit: m.item.unit } : undefined,
                  }));
                  setMovements(mapped);
                })
                .catch((err) => {
                  setMovementsError(formatServerError(err));
                })
                .finally(() => setLoadingMovements(false));
            }} />
          </div>
        </div>
      </div>

      <div className="fixed inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
    </div>
  );
}
