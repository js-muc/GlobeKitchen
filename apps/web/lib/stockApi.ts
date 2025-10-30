// apps/web/lib/stockApi.ts
const API_BASE =
  (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_API_BASE_URL ?? "")) ||
  "http://localhost:4000";

export type Paged<T> = { page: number; limit: number; total: number; data: T[] };

export type InventoryRow = {
  id: number;
  name: string;
  unit?: string;
  category?: string;
  priceSell?: string | null;
  createdAt: string;
  currentStock: number;
};

export type StockMovement = {
  id: number;
  itemId: number;
  direction: "IN" | "OUT";
  quantity: number;
  unitCost: string | null;
  note?: string | null;
  createdAt: string;
  item?: { name: string; unit?: string; category?: string };
};

async function checkResp(res: Response) {
  let json: any = null;
  try {
    json = await res.json().catch(() => null);
  } catch {
    json = null;
  }

  if (!res.ok) {
    const serverMsg =
      (json && (json.error?.message ?? json.message ?? json.error ?? json.detail)) ??
      res.statusText ??
      `HTTP ${res.status}`;
    const err: any = new Error(typeof serverMsg === "string" ? serverMsg : JSON.stringify(serverMsg));
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json;
}

function buildUrl(path: string, params?: Record<string, any>) {
  const qs = params ? new URLSearchParams(params as any).toString() : "";
  return `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

export async function listInventory(params: Record<string, any> = {}): Promise<Paged<InventoryRow>> {
  const { signal, ...qs } = params ?? {};
  const url = buildUrl("/api/stock", qs);
  const res = await fetch(url, { credentials: "include", signal });
  return checkResp(res);
}

export async function createMovement(payload: {
  itemId: number;
  direction: "IN" | "OUT";
  quantity: number;
  unitCost?: number | null;
  note?: string | null;
}): Promise<StockMovement> {
  const url = buildUrl("/api/stock/movement");
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 409) {
    const json = await res.json().catch(() => null);
    const err: any = new Error(json?.message ?? "conflict");
    err.status = 409;
    err.body = json;
    throw err;
  }

  return checkResp(res);
}

export async function listMovements(params: Record<string, any> = {}): Promise<Paged<StockMovement>> {
  const { signal, ...qs } = params ?? {};
  const url = buildUrl("/api/stock/movements", qs);
  const res = await fetch(url, { credentials: "include", signal });
  return checkResp(res);
}

export async function getItemStock(itemId: number): Promise<{ item_id: number; current_stock: string }> {
  const url = buildUrl(`/api/items/${itemId}/stock`);
  const res = await fetch(url, { credentials: "include" });
  return checkResp(res);
}

export async function itemsStockSummary(): Promise<Array<{ itemId: number; name: string; current_qty: string }>> {
  const url = buildUrl("/api/items/stock-summary");
  const res = await fetch(url, { credentials: "include" });
  return checkResp(res);
}

export async function updateMovement(
  id: number,
  payload: Partial<{ itemId: number; direction: "IN" | "OUT"; quantity: number; unitCost: number | null; note: string | null }>
) {
  const url = buildUrl(`/api/stock/movement/${id}`);
  const res = await fetch(url, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return checkResp(res);
}

export async function deleteMovement(id: number) {
  const url = buildUrl(`/api/stock/movement/${id}`);
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
  });
  return checkResp(res);
}

/**
 * Create an inventory item.
 */
export async function createItem(payload: {
  name: string;
  unit?: string | null;
  category?: string | null;
  startingQty?: number | null;
  priceSell?: number | null;
}) {
  const url = buildUrl("/api/items");

  const outPayload: any = {
    name: payload.name,
    unit: payload.unit ?? null,
    category: payload.category ?? null,
    priceSell: payload.priceSell !== undefined ? payload.priceSell : 0,
    startingQty: payload.startingQty !== undefined ? payload.startingQty : undefined,
  };

  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(outPayload),
  });

  return checkResp(res);
}

/**
 * Delete an inventory item.
 * If force === true will call ?force=true (attempts hard delete). Default is soft-delete.
 */
export async function deleteItem(id: number, force = false) {
  const url = buildUrl(`/api/items/${id}`, force ? { force: true } : undefined);
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
  });
  return checkResp(res);
}

/**
 * Restore a soft-deleted item.
 */
export async function restoreItem(id: number) {
  const url = buildUrl(`/api/items/${id}/restore`);
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
  });
  return checkResp(res);
}
