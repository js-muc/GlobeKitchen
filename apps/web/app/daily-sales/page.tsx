// LABEL: PAGE_DAILY_SALES_V10
"use client";

import React from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  // keep original APIs available (fallbacks)
  createOrGetShift as apiCreateOrGetShiftMaybe,
  addShiftLine,
  getShiftSummary,
  // ts-expect-error: may or may not exist; we fall back to REST
  closeShift as apiCloseShiftMaybe,
  createCashup,
  type Shift,
  // NEW (already present in your api.sales.ts)
  listShifts,
  listCashups,
} from "@/lib/api.sales";
import {
  Search,
  Save,
  Printer,
  XCircle,
  History,
  CircleDashed,
  ChevronDown,
  Trash2,
  User2,
} from "lucide-react";
import { useEmployeesLite } from "@/lib/hooks/useEmployeesLite";
import { useMenuItemsSearch, type ItemLite } from "@/lib/hooks/useMenuItemsSearch";
import { api } from "@/lib/api";

/* ===== Robust numeric helpers ===== */
const toNum = (v: unknown) =>
  typeof v === "number" ? (Number.isFinite(v) ? v : 0) : Number(v ?? 0) || 0;
const fmtMoney = (v: unknown) => toNum(v).toFixed(2);
const todayStr = () => new Date().toISOString().slice(0, 10);

/* ===== Summary types (defensive) ===== */
type SummaryRow = {
  itemId: number | string;
  unit: string | null | undefined;
  price: number | string | null | undefined;
  issued: number | string | null | undefined;
  added: number | string | null | undefined;
  returned: number | string | null | undefined;
  sold: number | string | null | undefined;
  remaining: number | string | null | undefined;
  cashDue: number | string | null | undefined;
};
type ShiftSummary = {
  byItem: SummaryRow[];
  totals: { cashDue: number | string; lines: number | string };
};

/* ===== Stable Inventory Catalog (independent of search) ===== */
function useItemsCatalog() {
  return useQuery<ItemLite[]>({
    queryKey: ["items", "catalog"],
    queryFn: async () => {
      const res = await api.get("/items", { params: { limit: 5000 } });
      const rows = Array.isArray(res.data?.data) ? res.data.data : res.data;
      return (rows ?? []).map((it: any) => ({
        id: Number(it.id),
        name: it.name ?? it.title ?? `Item #${it.id}`,
        unit: it.unit ?? it.defaultUnit ?? "",
        priceSell:
          typeof it.price === "number"
            ? it.price
            : Number(it.price ?? it.defaultPrice ?? 0),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ===== Fuzzy match utility for datalist-free typing ===== */
function fuzzyPick<T extends { name?: string | null; id: number }>(list: T[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = list.find((x) => (x.name || "").toLowerCase() === q);
  if (exact) return exact;
  const starts = list.find((x) => (x.name || "").toLowerCase().startsWith(q));
  if (starts) return starts;
  const contains = list.find((x) => (x.name || "").toLowerCase().includes(q));
  return contains ?? null;
}

/* ===== Correct BE helpers: get-or-open shift by employeeId ===== */
async function getCurrentShift(employeeId: number) {
  // FIX: route must be under /daily-sales/shifts/current
  const res = await api.get("/daily-sales/shifts/current", { params: { employeeId } });
  return res.data?.shift ?? res.data;
}
async function openShiftREST(params: {
  employeeId: number;
  waiterType: "INSIDE" | "FIELD";
  tableCode?: string;
}) {
  const body: any = {
    date: todayStr(),
    employeeId: params.employeeId,
    waiterType: params.waiterType,
  };
  if (params.waiterType === "INSIDE" && params.tableCode) {
    body.tableCode = params.tableCode;
  }
  const res = await api.post("/daily-sales/shifts/open", body);
  return res.data?.shift ?? res.data;
}
async function getOrOpenShift(
  employeeId: number,
  waiterType: "INSIDE" | "FIELD",
  tableCode?: string
) {
  if (typeof apiCreateOrGetShiftMaybe === "function") {
    // @ts-ignore – optional service
    return apiCreateOrGetShiftMaybe({ employeeId, waiterType, tableCode });
  }
  // 1) try current
  try {
    const cur = await getCurrentShift(employeeId);
    if (cur?.id) return cur;
  } catch (e: any) {
    const status = e?.response?.status ?? e?.status;
    if (status && status !== 404) throw e;
  }
  // 2) open new
  return openShiftREST({ employeeId, waiterType, tableCode });
}

/* ===== Optional helpers added for cashier/day-end (404-tolerant) ===== */
async function getDailyRollup(date: string): Promise<ShiftSummary | null> {
  try {
    const res = await api.get("/daily-sales/summary/daily", { params: { date } });
    return res.data as ShiftSummary;
  } catch (e: any) {
    const status = e?.response?.status ?? e?.status;
    if (status === 404) return null; // route not present yet
    throw e;
  }
}

type CashupSnap =
  | { snapshot: any; note?: string | null; submittedBy?: string | null }
  | { snapshots: Array<{ at: string; payload: any }> };

async function getCashupSnapshot(shiftId: number): Promise<CashupSnap | null> {
  try {
    const res = await api.get(`/daily-sales/shifts/${shiftId}/cashup`);
    return res.data as CashupSnap;
  } catch (e: any) {
    const status = e?.response?.status ?? e?.status;
    if (status === 404) return null;
    throw e;
  }
}

/* ===== Lightweight employee-name cache for chips/rollups ===== */
async function fetchEmployeeName(id: number): Promise<string> {
  try {
    const res = await api.get(`/employees/${id}`);
    const row = res.data?.data ?? res.data;
    return row?.name ?? `#${id}`;
  } catch {
    return `#${id}`;
  }
}

export default function DailySalesPage() {
  const qc = useQueryClient();

  /* ---------- state ---------- */
  const [employeeId, setEmployeeId] = React.useState<number>(0);
  const [employeeQuery, setEmployeeQuery] = React.useState<string>("");
  const [waiterType, setWaiterType] = React.useState<"INSIDE" | "FIELD">("INSIDE");
  const [shift, setShift] = React.useState<Shift | null>(null);

  const [itemId, setItemId] = React.useState<number>(0);
  const [itemQuery, setItemQuery] = React.useState<string>("");
  const [qty, setQty] = React.useState<number>(1);
  const [unitPrice, setUnitPrice] = React.useState<number>(0);
  const [unit, setUnit] = React.useState<string>("plate");
  const [tableCode, setTableCode] = React.useState<string>("");

  const [showDaily, setShowDaily] = React.useState<boolean>(false);
  const [showCashup, setShowCashup] = React.useState<boolean>(false);

  /* New UI toggles */
  const [showByEmployee, setShowByEmployee] = React.useState<boolean>(true);
  const [expandedEmp, setExpandedEmp] = React.useState<number | null>(null);

  /* Live line total */
  const lineTotal = React.useMemo(() => toNum(qty) * toNum(unitPrice), [qty, unitPrice]);

  /* ---------- data ---------- */
  const { data: employees = [] } = useEmployeesLite(employeeQuery);
  const { data: menuItems = [] } = useMenuItemsSearch(itemQuery);
  const { data: itemsCatalog = [] } = useItemsCatalog();

  // Today’s shifts (history strip)
  const { data: todaysShifts } = useQuery({
    queryKey: ["daily-sales", "shifts", todayStr()],
    queryFn: () =>
      listShifts({ dateFrom: todayStr(), dateTo: todayStr(), page: 1, limit: 200 }),
    staleTime: 30_000,
  });

  // Daily rollup (on demand, 404 tolerant)
  const qDaily = useQuery<ShiftSummary | null>({
    enabled: showDaily,
    queryKey: ["daily-sales", "summary", "daily", todayStr()],
    queryFn: () => getDailyRollup(todayStr()),
  });

  // Cash-up snapshot viewer (on demand, 404 tolerant)
  const qCashup = useQuery<CashupSnap | null>({
    enabled: showCashup && !!shift?.id,
    queryKey: ["daily-sales", "cashup", shift?.id],
    queryFn: () => getCashupSnapshot(shift!.id),
  });

  /* ---------- Name resolution strategy ---------- */
  const catalogNameById = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const it of itemsCatalog) m.set(it.id, it.name!);
    return m;
  }, [itemsCatalog]);

  const [selectedNameById, setSelectedNameById] = React.useState<Map<number, string>>(
    () => new Map()
  );
  const [lazyNames, setLazyNames] = React.useState<Map<number, string>>(() => new Map());

  const resolveItemName = React.useCallback(
    (id: number | string): string => {
      const nid = Number(id);
      return (
        selectedNameById.get(nid) ||
        catalogNameById.get(nid) ||
        lazyNames.get(nid) ||
        `Item #${nid}`
      );
    },
    [catalogNameById, selectedNameById, lazyNames]
  );

  /* ---------- EMPLOYEE NAME MAP FOR TODAY’S SHIFTS ---------- */
  const [empNameById, setEmpNameById] = React.useState<Map<number, string>>(() => new Map());
  React.useEffect(() => {
    (async () => {
      const ids =
        todaysShifts?.data?.map((s: any) => Number(s.employeeId)).filter(Boolean) ?? [];
      const unique = Array.from(new Set(ids)).filter((id) => !empNameById.has(id));
      if (!unique.length) return;
      const results = await Promise.all(unique.map((id) => fetchEmployeeName(id)));
      setEmpNameById((prev) => {
        const next = new Map(prev);
        for (let i = 0; i < unique.length; i++) next.set(unique[i], results[i]);
        return next;
      });
    })();
  }, [todaysShifts, empNameById]);

  /* ---------- PER-SHIFT TOTALS + PER-EMPLOYEE TOTALS ---------- */
  const [shiftTotalById, setShiftTotalById] = React.useState<Map<number, number>>(
    () => new Map()
  );
  React.useEffect(() => {
    (async () => {
      const list = todaysShifts?.data ?? [];
      const missing = list
        .map((s: any) => s.id)
        .filter((id: number) => !shiftTotalById.has(id));
      if (!missing.length) return;

      const fetched = await Promise.all(
        missing.map(async (id: number) => {
          try {
            const s = await getShiftSummary(id);
            return { id, total: Number(s?.totals?.cashDue || 0) };
          } catch {
            return { id, total: 0 };
          }
        })
      );
      setShiftTotalById((prev) => {
        const next = new Map(prev);
        for (const f of fetched) next.set(f.id, f.total);
        return next;
      });
    })();
  }, [todaysShifts, shiftTotalById]);

  const totalsByEmployee = React.useMemo(() => {
    const acc = new Map<number, number>();
    for (const s of (todaysShifts?.data ?? []) as any[]) {
      const t = shiftTotalById.get(s.id) ?? 0;
      acc.set(s.employeeId, (acc.get(s.employeeId) ?? 0) + t);
    }
    return acc;
  }, [todaysShifts, shiftTotalById]);

  /* ---------- mutations / queries ---------- */

  // Get or Open shift (uses correct API)
  const mGetOrOpen = useMutation({
    mutationFn: async () => {
      const id =
        employeeId ||
        employees.find((e) => `${e.name} (#${e.id})` === employeeQuery || e.name === employeeQuery)
          ?.id ||
        0;
      if (!id) throw new Error("Pick an employee from the list.");
      const s = await getOrOpenShift(id, waiterType, tableCode || undefined);
      return s;
    },
    onSuccess: (s: any) => {
      setShift(s);
      if (s?.employeeId) setEmployeeId(Number(s.employeeId));
      qc.invalidateQueries({ queryKey: ["daily-sales", "shifts", todayStr()] });
    },
  });

  const {
    data: summary,
    refetch: refetchSummary,
    isFetching,
  } = useQuery<ShiftSummary>({
    enabled: !!shift?.id,
    queryKey: ["daily-sales", "summary", shift?.id],
    queryFn: () => getShiftSummary(shift!.id),
  });

  const mAddSale = useMutation({
    mutationFn: () =>
      // FIX: backend expects { itemId, qty, unit, unitPrice, note? }
      addShiftLine(shift!.id, {
        itemId,
        qty,
        unit,
        unitPrice,
        type: "ISSUE"
      }),
    onSuccess: () => {
      refetchSummary();
      setQty(1);
      setTableCode("");
      qc.invalidateQueries({ queryKey: ["daily-sales", "shifts", todayStr()] });
      setShiftTotalById((prev) => {
        const next = new Map(prev);
        next.delete(shift!.id);
        return next;
      });
    },
  });

  // Close shift (tries app service, falls back to REST)
  const mCloseShift = useMutation({
    mutationFn: async () => {
      if (!shift?.id) throw new Error("No shift to close.");
      if (typeof apiCloseShiftMaybe === "function") {
        // @ts-ignore
        return apiCloseShiftMaybe(shift.id);
      }
      const res = await api.post(`/daily-sales/shifts/${shift.id}/close`, {
        notes: "Closed from UI",
      });
      return res.data ?? { ok: true };
    },
    onSuccess: () => {
      setShift(null);
      setItemId(0);
      setItemQuery("");
      setQty(1);
      setUnitPrice(0);
      setUnit("plate");
      setTableCode("");
      qc.invalidateQueries({ queryKey: ["daily-sales", "shifts", todayStr()] });
      setShiftTotalById(new Map());
    },
  });

  // Save Cash-up snapshot to server
  const mSaveCashup = useMutation({
    mutationFn: async () => {
      if (!shift?.id) throw new Error("No shift to save.");
      if (!summary) throw new Error("No summary to save.");
      return createCashup(shift.id, {
        submittedBy: employeeId ? Number(employeeId) : undefined,
      });
    },
    onSuccess: () => {
      if (showCashup) qc.invalidateQueries({ queryKey: ["daily-sales", "cashup", shift?.id] });
    },
  });

  // Load cashups per-employee when expanded (uses server paging; date+employeeId)
  const qEmpCashups = useQuery({
    enabled: expandedEmp != null,
    queryKey: ["daily-sales", "cashups", todayStr(), expandedEmp],
    queryFn: () =>
      listCashups({
        date: todayStr(),
        employeeId: expandedEmp ?? undefined,
        page: 1,
        limit: 50,
      }),
  });

  // Optional delete (only if BE supports it); graceful if 404
  const mDeleteCashup = useMutation({
    mutationFn: async (id: number) => {
      try {
        const res = await api.delete(`/daily-sales/cashups/${id}`);
        return res.data ?? { ok: true };
      } catch (e: any) {
        const status = e?.response?.status ?? e?.status;
        if (status === 404 || status === 501) {
          throw new Error("Delete not supported on server.");
        }
        throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["daily-sales", "cashups", todayStr(), expandedEmp],
      });
    },
  });

  /* ---------- derived ---------- */
  const canGetShift =
    (employeeQuery.trim().length > 0 || employeeId > 0) && !mGetOrOpen.isPending;

  const canAddSale =
    !!shift &&
    !mAddSale.isPending &&
    itemId > 0 &&
    qty > 0 &&
    unitPrice > 0 &&
    unit.trim().length > 0 &&
    (!shift || (shift as any).status !== "CLOSED");

  const canCloseShift = !!shift && (shift as any)?.closedAt == null && !mCloseShift.isPending;

  /* ---------- auto-fill price + unit when picking an item ---------- */
  const applyItemDefaultsFrom = React.useCallback(
    (it: Partial<ItemLite> | undefined | null) => {
      if (!it) return;
      if (it.priceSell != null) setUnitPrice(Number(it.priceSell));
      if (it.unit) setUnit(it.unit);
    },
    []
  );

  const handleItemPicked = React.useCallback(
    (picked: ItemLite | null) => {
      if (!picked) return;
      setItemId(picked.id);
      setSelectedNameById((prev) => {
        const next = new Map(prev);
        next.set(picked.id, picked.name || `Item #${picked.id}`);
        return next;
      });
      applyItemDefaultsFrom(picked);
    },
    [applyItemDefaultsFrom]
  );

  const finalizeTypedItem = React.useCallback(() => {
    if (itemId) return; // already chosen via datalist
    const picked = fuzzyPick(menuItems, itemQuery);
    if (picked) {
      handleItemPicked(picked as ItemLite);
      setItemQuery(`${picked.name} (#${picked.id})`);
    }
  }, [itemId, itemQuery, menuItems, handleItemPicked]);

  /* ---------- Lazy fetch names missing in summary ---------- */
  React.useEffect(() => {
    (async () => {
      if (!summary?.byItem?.length) return;
      const missingIds: number[] = [];
      for (const row of summary.byItem) {
        const id = Number(row.itemId);
        if (!selectedNameById.has(id) && !catalogNameById.has(id) && !lazyNames.has(id)) {
          missingIds.push(id);
        }
      }
      if (!missingIds.length) return;
      const fetched = await Promise.all(
        missingIds.map(async (id) => {
          try {
            const res = await api.get(`/items/${id}`);
            const it = res.data?.data ?? res.data;
            const name = it?.name ?? it?.title ?? `Item #${id}`;
            return { id, name: String(name) };
          } catch {
            return { id, name: `Item #${id}` };
          }
        })
      );
      setLazyNames((prev) => {
        const next = new Map(prev);
        for (const f of fetched) next.set(f.id, f.name);
        return next;
      });
    })();
  }, [summary, catalogNameById, selectedNameById, lazyNames]);

  const printSummary = React.useCallback(() => window.print(), []);

  /* ---------- UI ---------- */
  return (
    <DashboardShell>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="inline-flex items-center justify-center rounded-xl border p-2 w-10 h-10">
          <Search className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Daily Sales</h1>
          <p className="text-sm text-muted-foreground">
            Get or reopen a shift, record sales, and view totals.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-2 lg:mt-0 lg:ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowByEmployee((s) => !s)}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 border bg-background hover:bg-muted"
            title="Show today by employee"
          >
            <User2 className="w-4 h-4" />
            <span className="text-sm">By Employee</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showByEmployee ? "rotate-180" : ""}`} />
          </button>

          <button
            type="button"
            onClick={() => setShowDaily((s) => !s)}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 border bg-background hover:bg-muted"
            title="View whole-day rollup"
          >
            <History className="w-4 h-4" />
            <span className="text-sm">Daily Rollup</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showDaily ? "rotate-180" : ""}`} />
          </button>

          {shift && (
            <button
              type="button"
              onClick={() => setShowCashup((s) => !s)}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 border bg-background hover:bg-muted"
              title="View last saved cash-up snapshot"
            >
              <CircleDashed className="w-4 h-4" />
              <span className="text-sm">Cash-up Snapshot</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showCashup ? "rotate-180" : ""}`} />
            </button>
          )}

          <button
            type="button"
            onClick={() => mSaveCashup.mutate()}
            disabled={!shift || !summary || mSaveCashup.isPending}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 border bg-background hover:bg-muted disabled:opacity-60"
            title="Save a snapshot on the server for the cashier"
            aria-busy={mSaveCashup.isPending}
          >
            <Save className="w-4 h-4" />
            <span className="text-sm">
              {mSaveCashup.isPending ? "Saving…" : "Save for Cashier"}
            </span>
          </button>

          <button
            type="button"
            onClick={printSummary}
            disabled={!summary}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 border bg-background hover:bg-muted disabled:opacity-60"
          >
            <Printer className="w-4 h-4" />
            <span className="text-sm">Print Summary</span>
          </button>

          <button
            type="button"
            onClick={() => mCloseShift.mutate()}
            disabled={!canCloseShift}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-white bg-red-600 hover:bg-red-700 shadow disabled:opacity-60"
            aria-busy={mCloseShift.isPending}
            title="Close current shift"
          >
            <XCircle className="w-4 h-4" />
            <span className="text-sm">
              {mCloseShift.isPending ? "Closing…" : "Close Shift"}
            </span>
          </button>
        </div>
      </div>

      {/* NEW: Today's totals by employee (names + per-employee cash) */}
      {showByEmployee && (
        <div className="mb-4 rounded-xl border">
          <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
            <div className="text-sm font-semibold">Today by Employee</div>
            <div className="text-xs text-muted-foreground">
              {todaysShifts?.data?.length ?? 0} shifts
            </div>
          </div>

          {!(todaysShifts?.data?.length ?? 0) ? (
            <div className="p-3 text-sm text-muted-foreground">No shifts yet today.</div>
          ) : (
            <div className="p-3 space-y-3">
              {Array.from(
                new Map(
                  ((todaysShifts?.data ?? []) as any[]).map((s) => [s.employeeId, true] as const)
                ).keys()
              )
                .sort((a, b) => {
                  const an = empNameById.get(a) ?? `#${a}`;
                  const bn = empNameById.get(b) ?? `#${b}`;
                  return an.localeCompare(bn);
                })
                .map((empId) => {
                  const name = empNameById.get(empId) ?? `Employee #${empId}`;
                  const shifts = ((todaysShifts?.data ?? []) as any[]).filter(
                    (s) => s.employeeId === empId
                  );
                  const empTotal = totalsByEmployee.get(empId) ?? 0;

                  return (
                    <div key={empId} className="rounded-lg border">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedEmp((cur) => (cur === empId ? null : empId))
                        }
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background hover:bg-muted rounded-t-lg"
                      >
                        <div className="flex items-center gap-2">
                          <User2 className="w-4 h-4" />
                          <span className="font-medium">{name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({shifts.length} {shifts.length === 1 ? "shift" : "shifts"})
                          </span>
                        </div>
                        <div className="text-sm font-semibold tabular-nums">
                          ₵ {fmtMoney(empTotal)}
                        </div>
                      </button>

                      {/* Shift chips */}
                      <div className="px-3 pb-2">
                        <div className="flex flex-wrap gap-2">
                          {shifts.map((s: any) => {
                            const total = shiftTotalById.get(s.id) ?? 0;
                            const closed = !!s.closedAt;
                            return (
                              <button
                                key={s.id}
                                onClick={() =>
                                  setShift({
                                    id: s.id,
                                    date: String(s.date).slice(0, 10),
                                    employeeId: s.employeeId,
                                    status: closed ? "CLOSED" : "OPEN",
                                    cashExpected: 0,
                                    cashReceived: 0,
                                    shortOver: 0,
                                    lines: [],
                                  } as any)
                                }
                                className={`px-2 py-1 rounded-full border text-xs ${
                                  shift?.id === s.id ? "bg-muted" : "bg-background hover:bg-muted"
                                }`}
                                title={`Shift #${s.id} • ${closed ? "CLOSED" : "OPEN"}`}
                              >
                                #{s.id} • {closed ? "CLOSED" : "OPEN"} • ₵ {fmtMoney(total)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Cash-up snapshots per employee (for today) */}
                      {expandedEmp === empId && (
                        <div className="border-t px-3 py-2 text-sm">
                          {qEmpCashups.isFetching ? (
                            <div className="text-muted-foreground">Loading snapshots…</div>
                          ) : (qEmpCashups.data?.data?.length ?? 0) === 0 ? (
                            <div className="text-muted-foreground">No snapshots for today.</div>
                          ) : (
                            <div className="space-y-2">
                              {qEmpCashups.data!.data.map((row: any) => (
                                <div
                                  key={row.id}
                                  className="rounded-lg border p-2 flex items-start justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <div className="text-xs text-muted-foreground">
                                      Cashup #{row.id} • Shift #{row.shiftId} •{" "}
                                      {new Date(row.createdAt).toLocaleTimeString()}
                                    </div>
                                    <pre className="mt-1 text-xs whitespace-pre-wrap break-words max-h-40 overflow-auto">
                                      {JSON.stringify(row.snapshot?.summary ?? row.snapshot, null, 2)}
                                    </pre>
                                  </div>
                                  <div className="shrink-0 flex flex-col gap-2">
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted text-xs"
                                      onClick={() => mDeleteCashup.mutate(row.id)}
                                      disabled={mDeleteCashup.isPending}
                                      title="Delete snapshot (if supported by server)"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      {mDeleteCashup.isPending ? "Deleting…" : "Delete"}
                                    </button>
                                    {mDeleteCashup.isError && (
                                      <div className="text-[11px] text-red-600 max-w-[12rem]">
                                        {(mDeleteCashup.error as any)?.message || "Failed to delete."}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Original: Today's shifts (flat chips) */}
      <div className="mb-4">
        {todaysShifts?.data?.length ? (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground">Today’s Shifts:</span>
            {(todaysShifts.data as any[]).map((s) => (
              <button
                key={s.id}
                onClick={() =>
                  setShift({
                    id: s.id,
                    date: String(s.date).slice(0, 10),
                    employeeId: s.employeeId,
                    status: s.closedAt ? "CLOSED" : "OPEN",
                    cashExpected: 0,
                    cashReceived: 0,
                    shortOver: 0,
                    lines: [],
                  } as any)
                }
                className={`px-2 py-1 rounded-full text-xs border ${
                  shift?.id === s.id ? "bg-muted" : "bg-background hover:bg-muted"
                }`}
                title={`Shift #${s.id} • ${s.closedAt ? "CLOSED" : "OPEN"}`}
              >
                #{s.id} • {empNameById.get(s.employeeId) ?? s.employeeId} •{" "}
                {s.closedAt ? "CLOSED" : "OPEN"}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No shifts yet today.</div>
        )}
      </div>

      {/* Get/Open shift */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,360px)_auto_auto_1fr] items-end gap-3 mb-5">
        <div className="w-full">
          <label htmlFor="employeeName" className="text-sm font-medium">
            Employee
          </label>
          <div className="mt-1">
            <input
              id="employeeName"
              list="employee-list"
              className="w-full rounded-xl border px-3 py-2 bg-background"
              placeholder="type name…"
              value={employeeQuery}
              onChange={(e) => {
                const v = e.target.value;
                setEmployeeQuery(v);
                const match = employees.find(
                  (emp) => `${emp.name} (#${emp.id})` === v || emp.name === v
                );
                if (match) setEmployeeId(match.id);
              }}
              onBlur={() => {
                const match = employees.find(
                  (emp) =>
                    `${emp.name} (#${emp.id})` === employeeQuery ||
                    emp.name === employeeQuery
                );
                if (match) setEmployeeId(match.id);
              }}
              disabled={!!shift && (shift as any)?.closedAt == null}
              aria-disabled={!!shift && (shift as any)?.closedAt == null}
            />
            <datalist id="employee-list">
              {employees.map((e) => (
                <option key={e.id} value={`${e.name} (#${e.id})`} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-muted-foreground">
              {employeeId ? `Selected ID: ${employeeId}` : "Pick an employee"}
            </p>
          </div>
        </div>

        <div className="w-full">
          <label htmlFor="waiterType" className="text-sm font-medium">
            Waiter Type
          </label>
          <select
            id="waiterType"
            className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
            value={waiterType}
            onChange={(e) => setWaiterType(e.target.value as "INSIDE" | "FIELD")}
            disabled={!!shift && (shift as any)?.closedAt == null}
          >
            <option value="INSIDE">INSIDE</option>
            <option value="FIELD">FIELD</option>
          </select>
        </div>

        <button
          onClick={() => mGetOrOpen.mutate()}
          disabled={!canGetShift}
          className="rounded-xl px-4 py-2 text-white bg-brand shadow disabled:opacity-60"
          aria-busy={mGetOrOpen.isPending}
        >
          {mGetOrOpen.isPending ? "Loading..." : shift ? "Get / Open Shift" : "Get Shift"}
        </button>

        {shift && (
          <span className="text-sm text-muted-foreground sm:justify-self-end">
            <strong>Shift #{shift.id}</strong>{" "}
            • {(shift as any)?.closedAt ? "CLOSED" : "OPEN"} • {String((shift as any)?.date ?? todayStr()).slice(0,10)}
          </span>
        )}
      </div>

      {/* Quick SALE entry */}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!itemId && itemQuery) finalizeTypedItem();
          if (canAddSale) mAddSale.mutate();
        }}
      >
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,360px)_repeat(3,1fr)_minmax(160px,1fr)] gap-3">
          {/* Item search */}
          <div>
            <label htmlFor="itemName" className="text-sm font-medium">
              Item
            </label>
            <input
              id="itemName"
              list="menu-items-list"
              className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
              placeholder="type to search…"
              value={itemQuery}
              onChange={(e) => {
                const v = e.target.value;
                setItemQuery(v);
                const match = menuItems.find(
                  (it) => `${it.name} (#${it.id})` === v || it.name === v
                );
                if (match) {
                  handleItemPicked(match as ItemLite);
                }
              }}
              onBlur={finalizeTypedItem}
              disabled={!shift || (shift as any)?.closedAt != null}
            />
            <datalist id="menu-items-list">
              {menuItems.map((it) => (
                <option key={it.id} value={`${it.name} (#${it.id})`} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-muted-foreground">
              {itemId ? `Selected: ${resolveItemName(itemId)} (#${itemId})` : "Pick an item"}
            </p>
          </div>

          {/* Qty */}
          <div>
            <label htmlFor="qty" className="text-sm font-medium">
              Qty
            </label>
            <input
              id="qty"
              type="number"
              inputMode="numeric"
              min={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
              disabled={!shift || (shift as any)?.closedAt != null}
            />
          </div>

          {/* Unit */}
          <div>
            <label htmlFor="unit" className="text-sm font-medium">
              Unit
            </label>
            <input
              id="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
              placeholder="plate / bottle / glass"
              disabled={!shift || (shift as any)?.closedAt != null}
            />
          </div>

          {/* Unit Price */}
          <div>
            <label htmlFor="unitPrice" className="text-sm font-medium">
              Unit Price
            </label>
            <input
              id="unitPrice"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={unitPrice || ""}
              onChange={(e) => setUnitPrice(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
              placeholder="e.g. 80"
              disabled={!shift || (shift as any)?.closedAt != null}
            />
            <p className="mt-1 text-xs text-muted-foreground">Auto-filled from menu when you pick an item.</p>
          </div>

          {/* Live Line Total */}
          <div className="rounded-xl border p-3 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Line Total</div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtMoney(lineTotal)}
            </div>
          </div>

          {/* Table + submit */}
          <div className="xl:col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="tableCode" className="text-sm font-medium">
                Table (inside only)
              </label>
              <input
                id="tableCode"
                value={tableCode}
                onChange={(e) => setTableCode(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
                placeholder="A6 / A7…"
                disabled={!shift || (shift as any)?.closedAt != null}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={!canAddSale}
                className="w-full sm:w-auto rounded-xl px-4 py-2 text-white bg-brand shadow disabled:opacity-60"
                aria-busy={mAddSale.isPending}
              >
                {mAddSale.isPending ? "Adding…" : "Add SALE line"}
              </button>
            </div>
          </div>
        </div>

        {/* Inline feedback */}
        <div className="min-h-[1.5rem] mt-1">
          {mAddSale.isError && (
            <span className="text-sm text-red-600">Failed to add line. Check values and try again.</span>
          )}
          {mAddSale.isSuccess && <span className="text-sm text-green-700">Line added.</span>}
          {mSaveCashup.isError && (
            <span className="text-sm text-red-600">Failed to save cash-up. Please try again.</span>
          )}
          {mSaveCashup.isSuccess && <span className="text-sm text-green-700">Cash-up snapshot saved.</span>}
          {mCloseShift.isError && (
            <span className="text-sm text-red-600">Failed to close shift. Please try again.</span>
          )}
          {mCloseShift.isSuccess && (
            <span className="text-sm text-green-700">Shift closed. Use "Get Shift" to open a new one.</span>
          )}
          {mGetOrOpen.isError && (
            <span className="text-sm text-red-600">
              Couldn’t get/open a shift. Pick an employee from the list and try again.
            </span>
          )}
        </div>
      </form>

      {/* Daily rollup (whole day) */}
      {showDaily && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-semibold">Daily Rollup ({todayStr()})</h2>
            {qDaily.data && (
              <div className="text-sm text-muted-foreground">
                Lines: <strong>{toNum(qDaily.data.totals.lines)}</strong> • Cash Due:{" "}
                <strong>{fmtMoney(qDaily.data.totals.cashDue)}</strong>
              </div>
            )}
          </div>
          {!qDaily.isFetching && qDaily.data === null ? (
            <p className="text-sm text-muted-foreground">
              Daily rollup endpoint not available yet on the server.
            </p>
          ) : qDaily.isFetching ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : qDaily.data?.byItem?.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full border rounded-xl">
                <thead className="bg-muted/50">
                  <tr className="[&>th]:px-3 [&>th]:py-2 text-left text-sm">
                    <th>Item</th>
                    <th>Unit</th>
                    <th>Price</th>
                    <th>Sold</th>
                    <th>Cash Due</th>
                  </tr>
                </thead>
                <tbody>
                  {qDaily.data.byItem.map((r, idx) => {
                    const name = resolveItemName(r.itemId);
                    return (
                      <tr key={idx} className="[&>td]:px-3 [&>td]:py-2 border-t">
                        <td>{name}</td>
                        <td>{r.unit ?? ""}</td>
                        <td>{fmtMoney(r.price)}</td>
                        <td>{toNum((r as any).sold)}</td>
                        <td>{fmtMoney(r.cashDue)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t font-semibold">
                    <td colSpan={4} className="px-3 py-2 text-right">Total</td>
                    <td className="px-3 py-2">{fmtMoney(qDaily.data.totals.cashDue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sales yet today.</p>
          )}
        </div>
      )}

      {/* Cash-up snapshot viewer (current shift) */}
      {showCashup && shift && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-semibold">Cash-up Snapshot (Shift #{shift.id})</h2>
          </div>
          {!qCashup.isFetching && qCashup.data === null ? (
            <p className="text-sm text-muted-foreground">
              Snapshot endpoint not available yet on the server.
            </p>
          ) : qCashup.isFetching ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="rounded-xl border p-3 text-sm">
              {"snapshot" in (qCashup.data as any) ? (
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify((qCashup.data as any).snapshot, null, 2)}
                </pre>
              ) : (qCashup.data as any)?.snapshots?.length ? (
                <div className="space-y-3">
                  {(qCashup.data as any).snapshots.map((s: any, i: number) => (
                    <div key={i} className="rounded-lg border p-2">
                      <div className="text-muted-foreground mb-1">Saved at: {s.at}</div>
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(s.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">No snapshot found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary (current shift) */}
      <div className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
          <h2 className="text-lg font-semibold">Summary</h2>
          {summary && (
            <div className="text-sm text-muted-foreground">
              Lines: <strong>{toNum(summary.totals.lines)}</strong> • Cash Due:{" "}
              <strong>{fmtMoney(summary.totals.cashDue)}</strong>
            </div>
          )}
        </div>

        {!shift ? (
          <p className="text-sm text-muted-foreground">Get a shift to see totals.</p>
        ) : isFetching ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : summary?.byItem?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full border rounded-xl print:min-w-full">
              <thead className="bg-muted/50">
                <tr className="[&>th]:px-3 [&>th]:py-2 text-left text-sm">
                  <th>Item</th>
                  <th>Unit</th>
                  <th>Price</th>
                  <th>Issued</th>
                  <th>Added</th>
                  <th>Returned</th>
                  <th>Sold</th>
                  <th>Remain</th>
                  <th>Cash Due</th>
                </tr>
              </thead>
              <tbody>
                {summary.byItem.map((r, idx) => {
                  const name = resolveItemName(r.itemId);
                  return (
                    <tr key={idx} className="[&>td]:px-3 [&>td]:py-2 border-t">
                      <td>{name}</td>
                      <td>{r.unit ?? ""}</td>
                      <td>{fmtMoney(r.price)}</td>
                      <td>{toNum(r.issued)}</td>
                      <td>{toNum(r.added)}</td>
                      <td>{toNum(r.returned)}</td>
                      <td>{toNum(r.sold)}</td>
                      <td>{toNum(r.remaining)}</td>
                      <td>{fmtMoney(r.cashDue)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t font-semibold">
                  <td colSpan={8} className="px-3 py-2 text-right">
                    Total
                  </td>
                  <td className="px-3 py-2">{fmtMoney(summary.totals.cashDue)}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-3 text-xs text-muted-foreground print:text-[10pt]">
              Shift #{shift?.id} • {String((shift as any)?.date ?? todayStr()).slice(0,10)} • Employee ID:{" "}
              {employeeId || "—"}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No lines yet.</p>
        )}
      </div>
    </DashboardShell>
  );
}
