// ✅ TOPBAR_COMPACT_TOGGLE — apps/web/components/ui/Topbar.tsx
"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";

export default function Topbar({
  onOpenMenu,
  onToggleCompact,
  compact,
}: {
  onOpenMenu?: () => void;
  onToggleCompact?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const onLogout = async () => {
    try {
      await logout();
    } finally {
      router.push("/login");
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Mobile menu */}
          <button onClick={onOpenMenu} className="md:hidden btn" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>

          {/* Brand */}
          <div className="h-9 w-9 rounded-2xl bg-[color:var(--color-brand)]/10 grid place-items-center">
            <span className="text-[color:var(--color-brand)] text-lg">🍲</span>
          </div>
          <div>
            <p className="font-semibold leading-4">Globe Organic Kitchen</p>
            <p className="text-xs text-gray-500 -mt-0.5">Management System</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Compact toggle for md+ */}
          <button
            onClick={onToggleCompact}
            className="hidden md:inline-flex btn"
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            title={compact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {compact ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>

          <button onClick={onLogout} className="btn">
            <LogOut className="mr-1.5 h-4 w-4" /> Logout
          </button>
        </div>
      </div>
    </header>
  );
}
