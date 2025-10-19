// ✅ UI_DRAWER — apps/web/components/ui/Drawer.tsx
"use client";

import React from "react";
import clsx from "clsx";

export default function Drawer({
  open,
  onClose,
  title,
  children,
  widthClass = "w-full sm:w-[520px]",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  widthClass?: string;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 z-50 bg-black/30 transition-opacity",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        className={clsx(
          "fixed inset-y-0 right-0 z-50 bg-white shadow-xl border-l transition-transform",
          open ? "translate-x-0" : "translate-x-full",
          widthClass
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50"
            onClick={onClose}
            aria-label="Close drawer"
          >
            Close
          </button>
        </div>
        <div className="h-[calc(100%-3.5rem)] overflow-y-auto p-4">{children}</div>
      </aside>
    </>
  );
}
