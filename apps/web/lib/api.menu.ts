// File: apps/web/lib/api.menu.ts
// --------------------------------
import {
  api as coreApi,
  menuApi as rawMenuApi,
  parseError,
  getAuthToken,
  IS_SAME_ORIGIN,
} from "@/lib/api";
import type {
  MenuItem,
  MenuItemRaw,
  MenuListEnvelope,
  MenuListMeta,
  MenuItemCreate,
  MenuItemUpdate,
  ListMenuParams,
} from "./types/menu";
import { toMenuItem } from "./types/menu";

/**
 * Pick the right client per call:
 * - Same origin (cookie auth) -> use core API
 * - Cross origin:
 *    - if token exists -> use menu API with Bearer
 *    - if no token (cookie-only session) -> fall back to core API so it works
 */
function pickClient() {
  const tok = getAuthToken();
  if (IS_SAME_ORIGIN) {
    return { client: coreApi, headers: undefined as Record<string, string> | undefined };
  }
  if (tok) {
    return { client: rawMenuApi, headers: { Authorization: `Bearer ${tok}` } };
  }
  // No token + cross origin: prefer core API (cookie-based) to avoid 401
  return { client: coreApi, headers: undefined };
}

export const MENU_QK = {
  all: ["menu", "items"] as const,
  list: (params: ListMenuParams) => ["menu", "items", params] as const,
  byId: (id: number) => ["menu", "item", id] as const,
};

// --- helpers (ensure backend receives numbers, not strings) ---
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function listMenuItems(
  params: ListMenuParams
): Promise<{ items: MenuItem[]; meta?: MenuListMeta }> {
  try {
    const { client, headers } = pickClient();
    const res = await client.get("/items", { params, headers });
    const body = res.data as MenuItemRaw[] | MenuListEnvelope;

    // raw array (fallback shape)
    if (Array.isArray(body)) {
      return { items: body.map(toMenuItem) };
    }

    // canonical shape from our backend: { data, meta }
    if (body && Array.isArray((body as MenuListEnvelope).data)) {
      return {
        items: (body as MenuListEnvelope).data.map(toMenuItem),
        meta: (body as MenuListEnvelope).meta,
      };
    }

    return { items: [] };
  } catch (err: any) {
    throw new Error(parseError(err, "Failed to load menu items."));
  }
}

export async function createMenuItem(payload: MenuItemCreate): Promise<MenuItem> {
  try {
    const { client, headers } = pickClient();
    const body = {
      ...payload,
      priceSell: Number(payload.priceSell),
      costUnit: numOrNull(payload.costUnit),
      ...(payload.active !== undefined ? { active: !!payload.active } : {}),
    };
    const res = await client.post("/items", body, { headers });
    return toMenuItem(res.data as MenuItemRaw);
  } catch (err: any) {
    throw new Error(parseError(err, "Failed to create menu item."));
  }
}

export async function updateMenuItem(id: number, patch: MenuItemUpdate): Promise<MenuItem> {
  try {
    const { client, headers } = pickClient();
    const body: Partial<MenuItemUpdate> = { ...patch };

    if ("priceSell" in body && body.priceSell !== undefined) {
      body.priceSell = Number(body.priceSell as any);
    }
    if ("costUnit" in body) {
      const v = (body as any).costUnit;
      body.costUnit = v === undefined ? undefined : numOrNull(v);
    }
    if ("active" in body && body.active !== undefined) {
      body.active = !!body.active;
    }

    // ✅ confirmed edit route is PUT /items/:id
    const res = await client.put(`/items/${id}`, body, { headers });
    return toMenuItem(res.data as MenuItemRaw);
  } catch (err: any) {
    throw new Error(parseError(err, "Failed to update menu item."));
  }
}

/**
 * Default delete: try hard delete via DELETE /items/:id.
 * Graceful fallback to soft-delete (PATCH { active:false }) if DELETE is not available.
 */
export async function deleteMenuItem(id: number): Promise<void> {
  try {
    const { client, headers } = pickClient();
    await client.delete(`/items/${id}`, { headers });
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 404 || status === 405) {
      const { client, headers } = pickClient();
      await client.patch(`/items/${id}`, { active: false }, { headers });
      return;
    }
    throw new Error(parseError(err, "Failed to delete menu item."));
  }
}
