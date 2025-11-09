"use client";

import React, { useEffect, useState } from "react";
import { listInventory, deleteItem, restoreItem, Paged, InventoryRow, StockMovement, listMovements } from "@/lib/stockApi";
import MovementModal from "@/components/MovementModal";

type MovRow = {
  id: number;
  itemId: number;
  direction: "IN" | "OUT";
  quantity: number;
  unitCost?: number | null;
  note?: string | null;
  createdAt: string;
  item?: { name?: string; unit?: string };
};

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);

  // Movement modal
  const [movementOpen, setMovementOpen] = useState<boolean>(false);
  const [movementDefaultItem, setMovementDefaultItem] = useState<number | null>(null);

  // History modal
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);
  const [historyRows, setHistoryRows] = useState<MovRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState<number>(1);

  const [busyDeleteId, setBusyDeleteId] = useState<number | null>(null);

  const PAGE_LIMIT = 50;

  // --- load inventory (Materials only) ---
  useEffect(() => {
    const controller = new AbortController();
    let canceled = false;

    async function fetchPage() {
      setLoading(true);
      setErrorMessage(null);
      try {
        // backend enforces limit <= 200 — we use 50 for list page
        const res = await listInventory({ page, limit: PAGE_LIMIT, category: "Materials", signal: controller.signal });
        // normalize response shapes (paged or array)
        const raw = (res as any)?.data ?? res;
        let list: any[] = Array.isArray(raw) ? raw : [];

        // Some APIs return { data: [...] } or { rows: [...] } — check
        if (!Array.isArray(list)) {
          if (Array.isArray((res as any)?.data)) list = (res as any).data;
          else if (Array.isArray((res as any)?.rows)) list = (res as any).rows;
          else if (Array.isArray(res)) list = res as any[];
          else list = [];
        }

        // map to InventoryRow
        const normalized: InventoryRow[] = list.map((r: any) => {
          const id = Number(r.id ?? r.itemId ?? r.item_id);
          const name = String(r.name ?? r.title ?? r.itemName ?? "");
          const unit = r.unit ?? r.unitName ?? null;
          const category = r.category ?? r.type ?? null;
          const createdAt = r.createdAt ?? r.created_at ?? new Date().toISOString();
          const currentStockRaw = r.currentStock ?? r.current_qty ?? r.current ?? r.qty ?? r.quantity ?? 0;
          const currentStock = typeof currentStockRaw === "string" ? parseFloat(currentStockRaw) : Number(currentStockRaw ?? 0);
          return {
            id: Number.isFinite(id) ? id : NaN,
            name,
            unit,
            category,
            priceSell: r.priceSell != null ? String(r.priceSell) : r.price != null ? String(r.price) : null,
            createdAt,
            currentStock: Number.isFinite(currentStock) ? currentStock : 0,
          };
        });

        if (!canceled) setRows(normalized);
      } catch (e: any) {
        if (e?.name === "AbortError") {
          console.debug("Inventory fetch aborted");
        } else {
          console.error("Failed to load inventory (Materials).", e);
          const friend = e?.body?.message ?? e?.message ?? JSON.stringify(e);
          if (!canceled) setErrorMessage(`Failed to load inventory (Materials). ${String(friend)}`);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    fetchPage();

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [page]);

  // --- open movement modal (with optional default item) ---
  function openMovementFor(itemId?: number | null) {
    setMovementDefaultItem(itemId ?? null);
    setMovementOpen(true);
  }

  // --- history fetch & modal ---
  async function openHistory(itemId: number) {
    setHistoryItemId(itemId);
    setHistoryOpen(true);
    setHistoryPage(1);
    await loadHistory(itemId, 1);
  }

  async function loadHistory(itemId: number | null, pageToLoad = 1) {
    if (!itemId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await listMovements({ itemId, page: pageToLoad, limit: 100 });
      // normalize to array
      const raw = (res as any)?.data ?? res;
      let list: any[] = Array.isArray(raw) ? raw : [];
      if (!Array.isArray(list)) {
        if (Array.isArray((res as any)?.data)) list = (res as any).data;
        else if (Array.isArray((res as any)?.rows)) list = (res as any).rows;
        else list = [];
      }

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

      setHistoryRows(mapped);
    } catch (err: any) {
      console.error("Failed to load history", err);
      const friend = err?.body?.message ?? err?.message ?? JSON.stringify(err);
      setHistoryError(String(friend));
    } finally {
      setHistoryLoading(false);
    }
  }

  // --- delete / restore helpers ---
  async function handleDelete(item: InventoryRow) {
    if (!confirm(`Delete "${item.name}"? (Use "Force delete" to permanently remove even if there are movements)`)) return;
    setBusyDeleteId(item.id);
    setErrorMessage(null);
    try {
      const res = await deleteItem(item.id, false); // default: soft when necessary
      if ((res as any)?.deleted === "soft") {
        // reflect soft-delete by removing from list (or mark as inactive)
        setRows((prev) => prev.filter((r) => r.id !== item.id));
        alert(`"${item.name}" marked inactive (soft-deleted).`);
      } else {
        setRows((prev) => prev.filter((r) => r.id !== item.id));
        alert(`"${item.name}" permanently deleted.`);
      }
    } catch (err: any) {
      console.error("Delete item failed", err);
      const msg = err?.body?.message ?? err?.message ?? String(err);
      setErrorMessage(`Failed to delete item: ${String(msg)}`);
    } finally {
      setBusyDeleteId(null);
    }
  }

  async function handleForceDelete(item: InventoryRow) {
    if (!confirm(`PERMANENTLY delete "${item.name}"? This removes the item record entirely (admin only). Proceed?`)) return;
    setBusyDeleteId(item.id);
    setErrorMessage(null);
    try {
      const res = await deleteItem(item.id, true); // force hard delete
      setRows((prev) => prev.filter((r) => r.id !== item.id));
      alert(`"${item.name}" permanently deleted.`);
    } catch (err: any) {
      console.error("Force delete failed", err);
      const msg = err?.body?.message ?? err?.message ?? String(err);
      setErrorMessage(`Failed to permanently delete item: ${String(msg)}`);
    } finally {
      setBusyDeleteId(null);
    }
  }

  async function handleRestore(itemId: number) {
    if (!confirm("Restore this item (mark active)?")) return;
    try {
      const res = await restoreItem(itemId);
      // refresh page (simple approach)
      setPage((p) => Math.max(1, p));
      alert("Item restored.");
    } catch (err: any) {
      console.error("Restore failed", err);
      const msg = err?.body?.message ?? err?.message ?? String(err);
      setErrorMessage(`Failed to restore item: ${String(msg)}`);
    }
  }

  // --- render ---
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Materials Inventory</h1>
          <div className="text-sm text-muted-foreground">Showing items in category: <strong>Materials</strong></div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // trigger refresh by toggling page (cheap)
              setPage((p) => Math.max(1, p));
            }}
            className="px-3 py-1 border rounded text-sm"
          >
            Refresh
          </button>

          <button
            onClick={() => openMovementFor(null)}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
          >
            Create Movement
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <div className="inline-flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-20" />
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <span>Loading inventory…</span>
          </div>
        </div>
      ) : errorMessage ? (
        <div className="py-6">
          <div className="rounded border border-red-200 bg-red-50 p-4">
            <div className="text-red-800 mb-2 font-medium">Error</div>
            <div className="text-sm text-red-700 mb-3">{errorMessage}</div>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-white border rounded text-sm" onClick={() => setPage((p) => Math.max(1, p))}>
                Retry
              </button>
              <button className="px-3 py-1 bg-white border rounded text-sm" onClick={() => openMovementFor(null)}>
                Create Movement
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="text-left">
                <th className="p-2">Name</th>
                <th className="p-2">Unit</th>
                <th className="p-2">Category</th>
                <th className="p-2">Current</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.unit ?? "-"}</td>
                  <td className="p-2">{r.category ?? "-"}</td>
                  <td className="p-2">{Number(r.currentStock).toFixed(1)}</td>
                  <td className="p-2 flex items-center gap-3">
                    <button
                      className="text-sm underline"
                      onClick={() => {
                        setMovementDefaultItem(r.id);
                        setMovementOpen(true);
                      }}
                    >
                      Stock In / Out
                    </button>

                    <button
                      className="text-sm text-blue-600 underline"
                      onClick={(e) => {
                        e.preventDefault();
                        openHistory(r.id);
                      }}
                    >
                      History
                    </button>

                    <button
                      className="px-2 py-1 text-sm border rounded"
                      onClick={() => handleDelete(r)}
                      disabled={busyDeleteId === r.id}
                    >
                      {busyDeleteId === r.id ? "Deleting…" : "Delete"}
                    </button>

                    <button
                      className="px-2 py-1 text-sm border rounded bg-red-50 text-red-700"
                      onClick={() => handleForceDelete(r)}
                      disabled={busyDeleteId === r.id}
                      title="Permanently delete (admin only)"
                    >
                      Permanently delete
                    </button>

                    <button
                      className="px-2 py-1 text-sm border rounded bg-green-50 text-green-700"
                      onClick={() => handleRestore(r.id)}
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-sm text-muted-foreground">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <div className="text-sm">Page {page}</div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 border rounded text-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <button className="px-3 py-1 border rounded text-sm" onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      </div>

      <MovementModal
        open={movementOpen}
        onClose={() => setMovementOpen(false)}
        defaultItemId={movementDefaultItem}
        onCreated={() => {
          setMovementOpen(false);
          // refresh inventory after creating movement
          setPage((p) => Math.max(1, p));
        }}
      />

      {/* History modal implementation (keeps previous local component behaviour) */}
      {historyOpen && (
        <div className="fixed inset-0 z-40 flex items-start justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded shadow-lg overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Movement History</h3>
                <div className="text-sm text-muted-foreground">{rows.find((x) => x.id === historyItemId)?.name ?? `Item ${historyItemId}`}</div>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={() => { if (historyItemId) loadHistory(historyItemId, 1); }} className="px-3 py-1 border rounded text-sm">Refresh</button>
                <button onClick={() => { setHistoryOpen(false); setHistoryRows([]); }} className="px-3 py-1 bg-white border rounded text-sm">Close</button>
              </div>
            </div>

            <div className="p-4">
              {historyLoading ? (
                <div className="text-center py-8">Loading...</div>
              ) : historyError ? (
                <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{historyError}</div>
              ) : historyRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">No movements found for this item.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full table-auto">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2 text-xs">Date</th>
                        <th className="p-2 text-xs">Dir</th>
                        <th className="p-2 text-xs">Qty</th>
                        <th className="p-2 text-xs">Unit cost</th>
                        <th className="p-2 text-xs">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-2 text-sm">{new Date(r.createdAt).toLocaleString()}</td>
                          <td className="p-2 text-sm">{r.direction}</td>
                          <td className="p-2 text-sm">{Number(r.quantity).toFixed(1)}</td>
                          <td className="p-2 text-sm">{r.unitCost != null ? String(r.unitCost) : "-"}</td>
                          <td className="p-2 text-sm break-words max-w-xs">{r.note ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="fixed inset-0 bg-black/30" onClick={() => { setHistoryOpen(false); setHistoryRows([]); }} />
        </div>
      )}
    </div>
  );
}
