// File: apps/web/lib/types/menu.ts
// --------------------------------

export type MenuItemRaw = {
  id: number;
  name: string;
  category: string; // string label — no categories API
  unit: string; // e.g. "plate"
  priceSell: number | string; // server may serialize as string on GET
  costUnit: number | null;
  active: boolean;
  createdAt: string; // ISO
};

export type MenuItem = Omit<MenuItemRaw, "priceSell"> & { priceSell: number };

export type MenuListMeta = {
  total: number;
  page: number;
  limit: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type MenuListEnvelope = {
  data: MenuItemRaw[];
  meta: MenuListMeta;
};

export type ListMenuParams = {
  page?: number;            // default 1
  limit?: number;           // default 10
  search?: string;
  sortBy?: "createdAt" | "name" | "priceSell"; // align with backend
  sortDir?: "asc" | "desc";
};

export type MenuItemCreate = {
  name: string;
  category: string;
  unit: string;
  priceSell: number;        // REQUIRED by backend
  costUnit?: number | null;
  active?: boolean;
};

export type MenuItemUpdate = Partial<MenuItemCreate>;

export const toMenuItem = (raw: MenuItemRaw): MenuItem => ({
  ...raw,
  priceSell:
    typeof raw.priceSell === "string" ? Number(raw.priceSell) : raw.priceSell,
});

export const collectUniqueCategories = (items: MenuItem[]): string[] => {
  const set = new Set<string>();
  for (const it of items) if (it.category) set.add(it.category);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};
