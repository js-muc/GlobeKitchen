// ✅ DASHBOARD_SHELL_COMPACT_STATE — apps/web/components/layout/DashboardShell.tsx
"use client";

import { PropsWithChildren, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { me } from "@/lib/api";
import { useRouter } from "next/navigation";
import Topbar from "@/components/ui/Topbar";
import Sidebar from "@/components/ui/Sidebar";

const STORAGE_KEY = "sidebar:compact";

export default function DashboardShell({ children }: PropsWithChildren) {
  const router = useRouter();
  const q = useQuery({ queryKey: ["me"], queryFn: me, retry: false });

  // ✅ Mobile drawer state
  const [open, setOpen] = useState(false);

  // ✅ Compact mode (persisted)
  const [compact, setCompact] = useState<boolean>(false);
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setCompact(saved === "1");
  }, []);
  const toggleCompact = () => {
    setCompact((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    if (q.isError) router.push("/login");
  }, [q.isError, router]);

  return (
    <div className="min-h-screen">
      <Topbar onOpenMenu={() => setOpen(true)} onToggleCompact={toggleCompact} compact={compact} />
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr]">
        <Sidebar open={open} onClose={() => setOpen(false)} compact={compact} onToggleCompact={toggleCompact} />
        <main className="p-4 md:p-6 container">{children}</main>
      </div>
    </div>
  );
}
