// File: apps/web/components/menu/MenuFilters.tsx
// --------------------------------
import React from "react";

type SortBy = "createdAt" | "name" | "priceSell";

export function MenuFilters(props: {
  categories: string[];
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  sortBy: string; // keep wide for compatibility with page state
  sortDir: "asc" | "desc";
  onSortChange: (sortBy: SortBy, sortDir: "asc" | "desc") => void;
  limit: number;
  onLimitChange: (n: number) => void;
}) {
  const {
    categories,
    selectedCategory,
    onCategoryChange,
    sortBy,
    sortDir,
    onSortChange,
    limit,
    onLimitChange,
  } = props;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Category */}
      <div className="inline-flex items-center gap-1">
        <span className="text-sm opacity-60">Category:</span>
        <select
          className="rounded-lg border bg-background px-2 py-1 text-sm"
          aria-label="Filter by category"
          value={selectedCategory ?? ""}
          onChange={(e) => onCategoryChange(e.target.value || null)}
        >
          <option value="">All</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Sort */}
      <div className="inline-flex items-center gap-1">
        <span className="text-sm opacity-60">Sort:</span>
        <select
          className="rounded-lg border bg-background px-2 py-1 text-sm"
          aria-label="Sort by field"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy, sortDir)}
        >
          <option value="createdAt">Created</option>
          <option value="priceSell">Price</option>
          <option value="name">Name</option>
        </select>
        <select
          className="rounded-lg border bg-background px-2 py-1 text-sm"
          aria-label="Sort direction"
          value={sortDir}
          onChange={(e) => onSortChange((sortBy as SortBy), e.target.value as "asc" | "desc")}
        >
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </div>

      {/* Page size */}
      <div className="inline-flex items-center gap-1">
        <span className="text-sm opacity-60">Per page:</span>
        <select
          className="rounded-lg border bg-background px-2 py-1 text-sm"
          aria-label="Items per page"
          value={String(limit)}
          onChange={(e) => onLimitChange(Number(e.target.value))}
        >
          {[5, 10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
