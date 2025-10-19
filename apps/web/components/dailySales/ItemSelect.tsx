"use client";

import * as React from "react";
// ✅ Use the SEARCH hook from its module…
import { useMenuItemsSearch } from "@/lib/hooks/useMenuItemsSearch";
// ✅ …but use the broader ItemLite shape expected elsewhere
import type { ItemLite } from "@/lib/hooks/useMenuItems";
import { useDebounce } from "@/components/hooks/useDebounce";
import { Search } from "lucide-react";
import clsx from "clsx";

type Props = {
  value: ItemLite | null;
  onChange: (item: ItemLite | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function ItemSelect({
  value,
  onChange,
  placeholder = "Search item…",
  disabled,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debounced = useDebounce(query, 250);

  // Hook returns items compatible with ItemLite (priceSell may be number);
  // that still satisfies the broader ItemLite type used by parent components.
  const { data: items = [], isLoading } = useMenuItemsSearch(debounced);

  // Close dropdown on outside click
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  const renderPrice = (it: Pick<ItemLite, "priceSell">) => {
    const v =
      typeof it.priceSell === "string"
        ? Number(it.priceSell)
        : typeof it.priceSell === "number"
        ? it.priceSell
        : null;
    return v != null && Number.isFinite(v) ? `• ${v}` : "";
  };

  return (
    <div ref={ref} className="relative">
      <div
        className={clsx(
          "flex items-center rounded-xl border bg-white px-3 py-2",
          disabled && "opacity-60 pointer-events-none"
        )}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <Search className="h-4 w-4 mr-2 opacity-60" />
        <input
          className="flex-1 outline-none bg-transparent"
          placeholder={placeholder}
          value={open ? query : value?.name ?? ""}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {value && !open && (
          <span className="ml-2 text-xs text-gray-500">
            {value.unit ?? ""} {renderPrice(value)}
          </span>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg max-h-64 overflow-auto">
          {isLoading ? (
            <div className="p-3 text-sm text-gray-500">Loading…</div>
          ) : items.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">No items found.</div>
          ) : (
            <ul className="py-1" role="listbox">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    onChange(it as ItemLite); // safe: structurally compatible
                    setQuery("");
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={value?.id === it.id}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{it.name}</span>
                    <span className="text-xs text-gray-500">
                      {it.unit ?? ""} {renderPrice(it)}
                    </span>
                  </div>
                  {it.category && (
                    <div className="text-xs text-gray-400">{it.category}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
