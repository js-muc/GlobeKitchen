// File: apps/web/app/menu/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { MENU_QK, listMenuItems, createMenuItem, updateMenuItem, deleteMenuItem } from "@/lib/api.menu";
import type { ListMenuParams, MenuItemCreate, MenuItemUpdate, MenuItem } from "@/lib/types/menu";
import { collectUniqueCategories } from "@/lib/types/menu";
import { useDebounce } from "@/components/hooks/useDebounce";
import { Plus, Search, ChefHat } from "lucide-react";
import { MenuFilters, MenuDrawer, ConfirmDialog, MenuTable, MenuCard } from "@/components/menu";
import { getAuthToken, me, parseError, IS_SAME_ORIGIN } from "@/lib/api";

const DEFAULT_LIMIT = 10;

type SortBy = "createdAt" | "name" | "priceSell";

export default function MenuPage() {
  // ---------- Auth readiness ----------
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Same-origin => cookie session works; no token required.
      if (IS_SAME_ORIGIN) {
        if (alive) setAuthReady(true);
        return;
      }
      // Cross-origin => prefer cookie if present, else token.
      try {
        await me();
        if (alive) setAuthReady(true);
      } catch {
        if (alive) setAuthReady(!!getAuthToken());
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---------- UI State ----------
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const params: ListMenuParams = useMemo(
    () => ({ page, limit, search: debouncedSearch || undefined, sortBy, sortDir }),
    [page, limit, debouncedSearch, sortBy, sortDir]
  );

  const qc = useQueryClient();

  // ---------- Data ----------
  const { data, isLoading, isFetching } = useQuery({
    queryKey: MENU_QK.list(params),
    queryFn: () => listMenuItems(params),
    placeholderData: keepPreviousData,
    enabled: authReady, // don't fire until we know auth mode
    retry: false,
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  const categories = useMemo(() => collectUniqueCategories(items), [items]);
  const filteredItems = useMemo(() => {
    if (!categoryFilter) return items;
    return items.filter((it) => it.category === categoryFilter);
  }, [items, categoryFilter]);

  // ---------- Soft auth guard ----------
  // Do NOT throw here. Let the server decide (401/403), then show a friendly error.
  const ensureAuthed = () => {
    // Same-origin: cookie auth is fine even without a token.
    if (IS_SAME_ORIGIN) return;
    // Cross-origin: if no token, continue (server will 401) and we’ll surface a message.
    // This avoids blocking valid sessions or token-hydration races.
    return;
  };

  // ---------- Mutations ----------
  const mCreate = useMutation({
    mutationFn: async (payload: MenuItemCreate) => {
      ensureAuthed();
      return createMenuItem(payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MENU_QK.all as any }),
    onError: (err: any) => {
      alert(parseError(err, "Failed to create menu item. Please sign in again."));
    },
  });

  const mUpdate = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: MenuItemUpdate }) => {
      ensureAuthed();
      return updateMenuItem(id, patch);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MENU_QK.all as any }),
    onError: (err: any) => {
      alert(parseError(err, "Failed to update menu item. Please sign in again."));
    },
  });

  const mDelete = useMutation({
    mutationFn: async (id: number) => {
      ensureAuthed();
      return deleteMenuItem(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MENU_QK.all as any }),
    onError: (err: any) => {
      alert(parseError(err, "Failed to delete menu item. Please sign in again."));
    },
  });

  // ---------- Render ----------
  return (
    <DashboardShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border p-2"><ChefHat className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl font-semibold">Menu</h1>
            <p className="text-sm opacity-70">Manage dishes, prices, units and availability</p>
          </div>
        </div>
        <MenuDrawer
          mode="create"
          onSubmit={async (payload: MenuItemCreate) => {
            await mCreate.mutateAsync(payload);
          }}
          trigger={
            <button
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white bg-brand shadow hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              disabled={!authReady}
            >
              <Plus className="w-4 h-4" /> Add Item
            </button>
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 opacity-60" />
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search dishes..."
              className="w-full rounded-xl border bg-background px-9 py-2 outline-none focus:ring-2 focus:ring-brand"
              disabled={!authReady}
            />
          </div>

          <MenuFilters
            categories={categories}
            selectedCategory={categoryFilter}
            onCategoryChange={(c) => {
              setCategoryFilter(c);
              setPage(1);
            }}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={(sb, sd) => {
              setSortBy(sb);
              setSortDir(sd);
              setPage(1);
            }}
            limit={limit}
            onLimitChange={(n) => {
              setLimit(n);
              setPage(1);
            }}
          />
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <MenuTable
            loading={isLoading && authReady}
            fetching={isFetching}
            items={filteredItems}
            meta={meta}
            page={page}
            onPageChange={setPage}
            onEdit={(item: MenuItem) => (
              <MenuDrawer
                mode="edit"
                initial={item}
                onSubmit={async (payload) => {
                  await mUpdate.mutateAsync({ id: item.id, patch: payload });
                }}
              />
            )}
            onDelete={(item: MenuItem) => (
              <ConfirmDialog
                title="Delete Item"
                description={`Are you sure you want to delete "${item.name}"?`}
                confirmText="Delete"
                confirmVariant="danger"
                onConfirm={async () => {
                  await mDelete.mutateAsync(item.id);
                }}
              />
            )}
          />
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden grid grid-cols-1 gap-3">
          {!authReady ? (
            <div className="space-y-2">
              <div className="h-20 rounded-xl bg-muted animate-pulse" />
              <div className="h-20 rounded-xl bg-muted animate-pulse" />
              <div className="h-20 rounded-xl bg-muted animate-pulse" />
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              <div className="h-20 rounded-xl bg-muted animate-pulse" />
              <div className="h-20 rounded-xl bg-muted animate-pulse" />
              <div className="h-20 rounded-xl bg-muted animate-pulse" />
            </div>
          ) : (
            filteredItems.map((item) => (
              <MenuCard
                key={item.id}
                item={item}
                editButton={
                  <MenuDrawer
                    mode="edit"
                    initial={item}
                    onSubmit={async (payload) => {
                      await mUpdate.mutateAsync({ id: item.id, patch: payload });
                    }}
                  />
                }
                deleteButton={
                  <ConfirmDialog
                    title="Delete Item"
                    description={`Are you sure you want to delete "${item.name}"?`}
                    confirmText="Delete"
                    confirmVariant="danger"
                    onConfirm={async () => {
                      await mDelete.mutateAsync(item.id);
                    }}
                  />
                }
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {meta && (
          <div className="flex justify-end items-center gap-2 pt-2">
            <button
              className="rounded-lg px-3 py-1 border disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!meta.hasPrev}
            >
              Prev
            </button>
            <span className="text-sm opacity-70">
              Page {meta.page} / {meta.pages}
            </span>
            <button
              className="rounded-lg px-3 py-1 border disabled:opacity-50"
              onClick={() => setPage((p) => (meta.hasNext ? p + 1 : p))}
              disabled={!meta.hasNext}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
