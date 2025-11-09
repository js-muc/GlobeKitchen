// ✅ DASHBOARD_PAGE — apps/web/app/dashboard/page.tsx
"use client";

/* ============================
   ✅ LAYOUT_IMPORTS
============================ */
import DashboardShell from "@/components/layout/DashboardShell";
import { Stat } from "@/components/ui/Card";
import { QuickAction } from "@/components/ui/QuickAction";
import Link from "next/link";

/* ============================
   ✅ DATA_IMPORTS
============================ */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/* ============================
   ✅ ICON_IMPORTS (lucide-react)
============================ */
import {
  Users2,
  DollarSign,
  Boxes,
  TrendingUp,
  ReceiptText,
  Utensils,
  ShoppingCart,
  Calculator,
} from "lucide-react";

/* ============================
   ✅ TYPES (kept local to avoid import resolution issues)
============================ */
type Overview = {
  totalEmployees: number;
  employeesDelta: number;
  todaysSales: number;
  salesDeltaPct: number;
  stockItems: number;
  lowStock: number;
  monthlyRevenue: number;
  revenueDeltaPct: number;
};
type OverviewResponse = { ok: true; overview: Overview };

/* ============================
   ✅ HELPERS
============================ */
const KSh = (n: number) => "KSh " + n.toLocaleString();

/** Local fetcher (preserves original endpoint & shape) */
async function fetchOverview(): Promise<OverviewResponse> {
  const { data } = await api.get("/reports/overview");
  return data as OverviewResponse;
}

/* ============================
   ✅ PAGE
============================ */
export default function DashboardPage() {
  const q = useQuery<OverviewResponse>({
    queryKey: ["overview"],
    queryFn: fetchOverview,
  });
  const o = q.data?.overview;

  return (
    <DashboardShell>
      {/* ✅ PAGE_CONTAINER */}
      <div className="space-y-6">
        {/* Optional error banner */}
        {q.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load overview. Please check the API and try again.
          </div>
        )}

        {/* ✅ STATS_GRID — mobile:1 / sm:2 / xl:4 */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            title="Total Employees"
            value={q.isLoading ? "" : o?.totalEmployees ?? 0}
            sub={
              q.isLoading
                ? ""
                : `${(o?.employeesDelta ?? 0) >= 0 ? "+" : ""}${o?.employeesDelta ?? 0} this month`
            }
            icon={<Users2 className="h-5 w-5" />}
            intent="neutral"
            loading={q.isLoading}
          />

          <Stat
            title="Today's Sales"
            value={q.isLoading ? "" : KSh(o?.todaysSales ?? 0)}
            sub={q.isLoading ? "" : `${o?.salesDeltaPct ?? 0}% from yesterday`}
            icon={<DollarSign className="h-5 w-5" />}
            intent="success"
            loading={q.isLoading}
          />

          <Stat
            title="Stock Items"
            value={q.isLoading ? "" : o?.stockItems ?? 0}
            sub={q.isLoading ? "" : `${o?.lowStock ?? 0} items low stock`}
            icon={<Boxes className="h-5 w-5" />}
            intent="warning"
            loading={q.isLoading}
          />

          <Stat
            title="Monthly Revenue"
            value={q.isLoading ? "" : KSh(o?.monthlyRevenue ?? 0)}
            sub={q.isLoading ? "" : `${o?.revenueDeltaPct ?? 0}% from last month`}
            icon={<TrendingUp className="h-5 w-5" />}
            intent="success"
            loading={q.isLoading}
          />
        </div>

        {/* ✅ QUICK_ACTIONS_SECTION — responsive: 1 / 2 / 3 columns */}
        <section className="space-y-3">
          <div>
            <h2>Quick Actions</h2>
            <p className="text-sm text-gray-600">
              Access key management functions quickly
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* Only one Link wrapper per card; QuickAction is presentational */}
            <Link
              href="/employees"
              className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="rounded-[var(--radius-2xl)] border bg-white p-5 transition group-hover:shadow-md">
                <QuickAction
                  title="Employee Management"
                  desc="Add, edit, or remove employees"
                  icon={<Users2 className="h-5 w-5" />}
                  intent="employees"
                />
              </div>
            </Link>

            <Link
              href="/daily-sales"
              className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="rounded-[var(--radius-2xl)] border bg-white p-5 transition group-hover:shadow-md">
                <QuickAction
                  title="Daily Sales"
                  desc="Record sales by waiters and tables"
                  icon={<ReceiptText className="h-5 w-5" />}
                  intent="sales"
                />
              </div>
            </Link>

            <Link
              href="/stock"
              className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="rounded-[var(--radius-2xl)] border bg-white p-5 transition group-hover:shadow-md">
                <QuickAction
                  title="Stock Management"
                  desc="Manage inventory and stock levels"
                  icon={<Boxes className="h-5 w-5" />}
                  intent="stock"
                />
              </div>
            </Link>

            <Link
              href="/menu"
              className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="rounded-[var(--radius-2xl)] border bg-white p-5 transition group-hover:shadow-md">
                <QuickAction
                  title="Menu Management"
                  desc="Add or update menu items"
                  icon={<Utensils className="h-5 w-5" />}
                  intent="menu"
                />
              </div>
            </Link>

            {/* 🔁 UPDATED: route to Field Hub */}
            <Link
              href="/admin/field"
              className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="rounded-[var(--radius-2xl)] border bg-white p-5 transition group-hover:shadow-md">
                <QuickAction
                  title="Field Sales"
                  desc="Track field waiter activities"
                  icon={<ShoppingCart className="h-5 w-5" />}
                  intent="field"
                />
              </div>
            </Link>

            <Link
              href="/payroll"
              className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="rounded-[var(--radius-2xl)] border bg-white p-5 transition group-hover:shadow-md">
                <QuickAction
                  title="Salary Calculator"
                  desc="Calculate monthly salaries"
                  icon={<Calculator className="h-5 w-5" />}
                  intent="payroll"
                />
              </div>
            </Link>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
