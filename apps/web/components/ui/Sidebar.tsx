// ✅ SIDEBAR_ENHANCED_WITH_TOOLTIPS — apps/web/components/ui/Sidebar.tsx
"use client";

/* ============================
   ✅ IMPORTS
============================ */
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import * as Tooltip from "@radix-ui/react-tooltip"; // ✅ TOOLTIP_IMPORT
import {
  BarChart3,
  Users2,
  ReceiptText,
  Boxes,
  Utensils,
  Calculator,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ============================
   ✅ NAV_ITEMS
============================ */
const NAV = [
  { href: "/dashboard", label: "Overview", Icon: BarChart3 },
  { href: "/employees", label: "Employees", Icon: Users2 },
  { href: "/daily-sales", label: "Daily Sales", Icon: ReceiptText }, // 🔧 fixed route
  { href: "/stock", label: "Stock", Icon: Boxes },
  { href: "/menu", label: "Menu", Icon: Utensils },
  { href: "/payroll", label: "Payroll", Icon: Calculator },
];

/* ============================
   ✅ COMPONENT
============================ */
export default function Sidebar({
  open = false,
  onClose,
  compact = false,
  onToggleCompact,
}: {
  open?: boolean;
  onClose?: () => void;
  compact?: boolean;
  onToggleCompact?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* ✅ MOBILE_OVERLAY */}
      <div
        className={clsx(
          "fixed inset-0 z-30 bg-black/20 md:hidden transition-opacity",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* ✅ SIDEBAR_DRAWER */}
      <aside
        className={clsx(
          "fixed z-40 top-14 bottom-0 border-r bg-white transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          compact ? "w-16 md:w-16" : "w-72 md:w-[230px]"
        )}
      >
        {/* ✅ HEADER / COMPACT_TOGGLE (md+) */}
        <div className={clsx("flex items-center justify-end p-2 border-b", compact && "justify-center")}>
          <button
            type="button"
            onClick={onToggleCompact}
            className="btn hidden md:inline-flex"
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            title={compact ? "Expand" : "Collapse"}
          >
            {compact ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* ✅ NAV_LIST (Tooltip.Provider wraps links; tooltips only render in compact mode) */}
        <Tooltip.Provider delayDuration={200}>
          <nav className={clsx("p-3 space-y-1", compact && "px-2")}>
            {NAV.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/"); // 🔧 active for nested

              // ✅ NAV_LINK_ELEMENT (preserves original logic & classes)
              const linkEl = (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={clsx(
                    "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50",
                    active &&
                      "bg-[color:oklch(98%_0.02_150)] text-[color:var(--color-brand)] font-medium border-l-2 border-[color:var(--color-brand)]"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={clsx(
                      "h-4 w-4 shrink-0",
                      active ? "text-[color:var(--color-brand)]" : "text-gray-700 group-hover:text-gray-900"
                    )}
                  />
                  {/* Hide labels in compact mode */}
                  <span className={clsx("truncate", compact && "hidden")}>{label}</span>
                </Link>
              );

              // ✅ In compact mode, wrap with Tooltip; otherwise, render plain link
              return compact ? (
                <Tooltip.Root key={href}>
                  <Tooltip.Trigger asChild>{linkEl}</Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      align="center"
                      className="z-50 rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
                    >
                      {label}
                      <Tooltip.Arrow className="fill-gray-900" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ) : (
                linkEl
              );
            })}
          </nav>
        </Tooltip.Provider>
      </aside>
    </>
  );
}
