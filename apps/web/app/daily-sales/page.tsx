// C:\GlobeKitchen\apps\web\app\daily-sales\page.tsx
// LABEL: PAGE_DAILY_SALES_V18 (regenerated — visual polish, kiosk mode, branded receipt + dev credit)
"use client";

import React from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Namespace import to avoid TS named-export issues and allow runtime resolution.
import * as SalesApi from "@/lib/api.sales";

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
// IMPORTANT: use local date like API_SALES_V10 does
const todayStr = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD (local)

/* ===== Types (from SalesApi) ===== */
type Shift = SalesApi.Shift;

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
          typeof it?.priceSell === "number"
            ? it.priceSell
            : it?.priceSell != null
            ? Number(it.priceSell)
            : 0,
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

/* ===== Add-line resolver: supports addSaleLine and legacy addShiftLine ===== */
type AddLineFn = (args: {
  shiftId: number;
  itemId: number;
  qty: number;
  unitPrice: number;
  unit?: string;
  type?: string;
  note?: string;
}) => Promise<{ ok: boolean; line: any; shift?: any }>;

const addLine: AddLineFn = async (args) => {
  const fn =
    (SalesApi as any).addSaleLine ?? (SalesApi as any).addShiftLine; // both exist in API_SALES_V10
  if (typeof fn !== "function") throw new Error("Sales API add-line function not found.");
  const res = await fn(args);
  return res as { ok: boolean; line: any; shift?: any };
};

export default function DailySalesPage() {
  const qc = useQueryClient();

  /* ---------- state ---------- */
  const [employeeId, setEmployeeId] = React.useState<number>(0);
  const [employeeQuery, setEmployeeQuery] = React.useState<string>("");
  const [waiterType, setWaiterType] = React.useState<"INSIDE" | "FIELD">("INSIDE");
  const [shift, setShift] = React.useState<Shift | (Shift & { closedAt?: string | null }) | null>(null);

  const [itemId, setItemId] = React.useState<number>(0);
  const [itemQuery, setItemQuery] = React.useState<string>("");
  const [qty, setQty] = React.useState<number>(1);
  const [unitPrice, setUnitPrice] = React.useState<number>(0);
  const [unit, setUnit] = React.useState<string>("unit"); // default 'unit'
  const [tableCode, setTableCode] = React.useState<string>("");

  const [showDaily, setShowDaily] = React.useState<boolean>(false);
  const [showCashup, setShowCashup] = React.useState<boolean>(false);

  /* New UI toggles */
  const [showByEmployee, setShowByEmployee] = React.useState<boolean>(true);
  const [expandedEmp, setExpandedEmp] = React.useState<number | null>(null);

  /* Top-level ephemeral message (toast-like) */
  const [topMessage, setTopMessage] = React.useState<{ type: "info" | "error" | "success"; text: string } | null>(null);

  /* Live line total */
  const lineTotal = React.useMemo(() => toNum(qty) * toNum(unitPrice), [qty, unitPrice]);

  /* ---------- data ---------- */
  const { data: employees = [] } = useEmployeesLite(employeeQuery);
  const { data: menuItems = [] } = useMenuItemsSearch(itemQuery);
  const { data: itemsCatalog = [] } = useItemsCatalog();

  // Today’s shifts (history strip)
  const { data: todaysShifts } = useQuery({
    queryKey: ["daily-sales", "shifts", todayStr()],
    queryFn: () => SalesApi.listShifts({ dateFrom: todayStr(), dateTo: todayStr(), page: 1, limit: 200 }),
    staleTime: 30_000,
  });

  // Daily rollup (on demand, aligned to API_SALES_V10 getDailyRollup)
  const qDaily = useQuery<ShiftSummary | null>({
    enabled: showDaily,
    queryKey: ["daily-sales", "summary", "daily", todayStr()],
    queryFn: async () => {
      try {
        const r = await SalesApi.getDailyRollup(todayStr());
        return r as unknown as ShiftSummary;
      } catch (e: any) {
        // 404 tolerant in case BE doesn’t have it
        if ((e && (e.status || (e as any).status)) === 404) return null;
        throw e;
      }
    },
  });

  // Cash-up snapshot viewer (on demand)
  const qCashup = useQuery<any>({
    enabled: showCashup && !!shift?.id,
    queryKey: ["daily-sales", "cashup", shift?.id],
    queryFn: () => SalesApi.getShiftCashup(shift!.id),
  });

  /* ---------- Name resolution strategy ---------- */
  const catalogNameById = React.useMemo(() => {
    const m = new Map<number, string>();
    for (const it of itemsCatalog) m.set(it.id, it.name!);
    return m;
  }, [itemsCatalog]);

  const [selectedNameById, setSelectedNameById] = React.useState<Map<number, string>>(() => new Map());
  const [lazyNames, setLazyNames] = React.useState<Map<number, string>>(() => new Map());

  const resolveItemName = React.useCallback(
    (id: number | string): string => {
      const nid = Number(id);
      return selectedNameById.get(nid) || catalogNameById.get(nid) || lazyNames.get(nid) || `Item #${nid}`;
    },
    [catalogNameById, selectedNameById, lazyNames]
  );

  /* ---------- EMPLOYEE NAME MAP FOR TODAY’S SHIFTS ---------- */
  const [empNameById, setEmpNameById] = React.useState<Map<number, string>>(() => new Map());
  React.useEffect(() => {
    (async () => {
      const ids: number[] =
        (todaysShifts?.data?.map((s: any) => Number(s.employeeId)) ?? []).filter((n: number) => Number.isFinite(n) && n > 0);
      const unique: number[] = Array.from(new Set<number>(ids)).filter((id: number) => !empNameById.has(id));
      if (unique.length === 0) return;
      const results = await Promise.all(
        unique.map(async (id: number) => {
          try {
            const res = await api.get(`/employees/${id}`);
            const row = res.data?.data ?? res.data;
            return row?.name ?? `#${id}`;
          } catch {
            return `#${id}`;
          }
        })
      );
      setEmpNameById((prev) => {
        const next = new Map(prev);
        for (let i = 0; i < unique.length; i++) next.set(unique[i], results[i]);
        return next;
      });
    })();
  }, [todaysShifts, empNameById]);

  /* ---------- PER-SHIFT TOTALS + PER-EMPLOYEE TOTALS ---------- */
  const [shiftTotalById, setShiftTotalById] = React.useState<Map<number, number>>(() => new Map());
  React.useEffect(() => {
    (async () => {
      const list: any[] = todaysShifts?.data ?? [];
      const missing: number[] = list
        .map((s: any) => Number(s.id))
        .filter((id: number) => Number.isFinite(id) && id > 0 && !shiftTotalById.has(id));
      if (!missing.length) return;

      const fetched = await Promise.all(
        missing.map(async (id: number) => {
          try {
            const s = await SalesApi.getShiftSummary(id);
            return { id, total: Number((s as any)?.totals?.cashDue || 0) };
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
      const t = shiftTotalById.get(Number(s.id)) ?? 0;
      const empId = Number(s.employeeId);
      if (Number.isFinite(empId)) {
        acc.set(empId, (acc.get(empId) ?? 0) + t);
      }
    }
    return acc;
  }, [todaysShifts, shiftTotalById]);

  /* ---------- Keep page in sync with AddSaleLineForm's shift-change event ---------- */
  React.useEffect(() => {
    const onChange = async (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {};
      const newId = Number(detail.shiftId);
      if (!newId || !employeeId) return;
      try {
        // Resolve current open shift for this employee if available
        const cur = await SalesApi.getCurrentShiftForEmployee(employeeId);
        if ((cur as any)?.id) setShift(cur as any);
      } catch {
        // ignore
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("daily-sales:active-shift-changed", onChange as any);
      return () => window.removeEventListener("daily-sales:active-shift-changed", onChange as any);
    }
  }, [employeeId]);

  /* ---------- mutations / queries ---------- */

  // Helper to show top message briefly
  const flash = React.useCallback((type: "info" | "error" | "success", text: string, ttl = 5000) => {
    setTopMessage({ type, text });
    setTimeout(() => setTopMessage(null), ttl);
  }, []);

  // Get or Open shift — uses the API helper that handles current/reopen/new
  const mGetOrOpen = useMutation({
    mutationFn: async () => {
      const id =
        employeeId ||
        employees.find((e) => `${e.name} (#${e.id})` === employeeQuery || e.name === employeeQuery)?.id ||
        0;
      if (!id) throw new Error("Pick an employee from the list.");
      const s = await SalesApi.getOrReopenOrOpenShiftForEmployee({
        employeeId: id,
        waiterType,
        tableCode: tableCode || undefined,
        date: todayStr(),
      });
      return s;
    },
    onSuccess: (s: any) => {
      setShift(s);
      if (s?.employeeId) setEmployeeId(Number(s.employeeId));
      qc.invalidateQueries({ queryKey: ["daily-sales", "shifts", todayStr()] });
      flash("success", `Shift ${s?.id ? "#" + s.id : "opened"}`);
    },
    onError: (err: any) => {
      // Be friendly for conflicts — backends often return 409 for already-open shift
      const message =
        err?.response?.data?.message || err?.message || "Couldn’t open shift. Check employee or existing shift.";
      // if http status 409 present, suggest switching to existing shift
      const status = err?.response?.status ?? err?.status;
      if (status === 409) {
        flash("error", `${message} — another shift is already open. Refreshing today’s shifts.`);
        // refresh list so user can pick existing shift
        qc.invalidateQueries({ queryKey: ["daily-sales", "shifts", todayStr()] });
      } else {
        flash("error", message);
      }
    },
  });

  const { data: summary, refetch: refetchSummary, isFetching } = useQuery<ShiftSummary>({
    enabled: !!shift?.id,
    queryKey: ["daily-sales", "summary", shift?.id],
    queryFn: () => SalesApi.getShiftSummary(shift!.id) as unknown as Promise<ShiftSummary>,
  });

  const mAddSale = useMutation({
    mutationFn: async () =>
      addLine({
        shiftId: Number(shift!.id),
        itemId,
        qty,
        unit,
        unitPrice,
        type: "SALE",
      }),
    onSuccess: (res: any) => {
      // If backend reopened or created a NEW shift, swap the UI to that shift id.
      const serverShift = res?.shift;
      if (serverShift?.id && Number(serverShift.id) !== Number(shift!.id)) {
        setShift({
          id: Number(serverShift.id),
          date: String(serverShift.date ?? todayStr()).slice(0, 10),
          employeeId: Number(serverShift.employeeId),
          status: serverShift.closedAt ? "CLOSED" : "OPEN",
          closedAt: serverShift.closedAt ?? null,
          cashExpected: Number(serverShift.netSales ?? serverShift.grossSales ?? 0),
          cashReceived: Number(serverShift.cashRemit ?? 0),
          shortOver: 0,
          lines: [],
        } as any);
      }

      // Refresh list & summary for the (possibly new) shift
      qc.invalidateQueries({ queryKey: ["daily-sales", "shifts", todayStr()] });
      refetchSummary();

      // Reset the form
      setItemId(0);
      setItemQuery("");
      setUnit("unit");
      setUnitPrice(0);
      setQty(1);
      setTableCode("");

      // Clear any cached per-shift total so it recomputes
      setShiftTotalById((prev) => {
        const next = new Map(prev);
        next.delete(Number(serverShift?.id ?? shift!.id));
        return next;
      });

      flash("success", "Line added.");
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || err?.message || "Failed to add line.";
      flash("error", message);
    },
  });

  // Close shift (use API helper; your API already handles fallbacks)
  const mCloseShift = useMutation({
    mutationFn: async () => {
      if (!shift?.id) throw new Error("No shift to close.");
      return SalesApi.closeShift(Number(shift.id), { note: "Closed from UI" });
    },
    onSuccess: () => {
      setShift(null);
      setItemId(0);
      setItemQuery("");
      setQty(1);
      setUnitPrice(0);
      setUnit("unit");
      setTableCode("");
      qc.invalidateQueries({ queryKey: ["daily-sales", "shifts", todayStr()] });
      setShiftTotalById(new Map());
      flash("success", "Shift closed. Use Get Shift to open a new one.");
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || err?.message || "Failed to close shift.";
      flash("error", message);
    },
  });

  // Reopen shift (use API helper)
  const mReopenShift = useMutation({
    mutationFn: async () => {
      if (!shift?.id) throw new Error("No shift selected.");
      return SalesApi.reopenShift(Number(shift.id), "resume selling from UI");
    },
    onSuccess: (reopened: any) => {
      setShift({
        id: Number(reopened.id),
        date: String(reopened.date ?? (reopened as any).openedAt ?? todayStr()).slice(0, 10),
        employeeId: Number(reopened.employeeId),
        status: reopened.closedAt ? "CLOSED" : "OPEN",
        closedAt: reopened.closedAt ?? null,
        cashExpected: Number((reopened as any).netSales ?? (reopened as any).grossSales ?? 0),
        cashReceived: Number((reopened as any).cashRemit ?? 0),
        shortOver: 0,
        lines: [],
      } as any);

      qc.invalidateQueries({ queryKey: ["daily-sales", "shifts", todayStr()] });
      qc.invalidateQueries({ queryKey: ["daily-sales", "summary", reopened.id] });
      flash("success", "Shift reopened.");
    },
    onError: (err: any) => {
      flash("error", err?.message || "Failed to reopen shift.");
    },
  });

  // Save Cash-up snapshot to server
  const mSaveCashup = useMutation({
    mutationFn: async () => {
      if (!shift?.id) throw new Error("No shift to save.");
      if (!summary) throw new Error("No summary to save.");
      return SalesApi.createCashup(Number(shift.id), {
        submittedBy: employeeId ? Number(employeeId) : undefined,
      });
    },
    onSuccess: () => {
      if (showCashup) qc.invalidateQueries({ queryKey: ["daily-sales", "cashup", shift?.id] });
      flash("success", "Cash-up snapshot saved.");
    },
    onError: (err: any) => {
      flash("error", err?.message || "Failed to save cashup.");
    },
  });

  // Load cashups per-employee when expanded (uses server paging; date+employeeId)
  const qEmpCashups = useQuery({
    enabled: expandedEmp != null,
    queryKey: ["daily-sales", "cashups", todayStr(), expandedEmp],
    queryFn: () =>
      SalesApi.listCashups({
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
      flash("success", "Snapshot deleted.");
    },
    onError: (err: any) => {
      flash("error", err?.message || "Failed to delete snapshot.");
    },
  });

  /* ---------- derived ---------- */
  const canGetShift = (employeeQuery.trim().length > 0 || employeeId > 0) && !mGetOrOpen.isPending;

  // Robust closed detection: from status OR closedAt
  const isClosed = (shift as any)?.status === "CLOSED" || !!(shift as any)?.closedAt;

  const canAddSale =
    !!shift &&
    !mAddSale.isPending &&
    itemId > 0 &&
    qty > 0 &&
    unitPrice >= 0 &&
    unit.trim().length > 0 &&
    !isClosed;

  const canCloseShift = !!shift && !isClosed && !mCloseShift.isPending;

  /* ---------- auto-fill price + unit when picking an item ---------- */
  const applyItemDefaultsFrom = React.useCallback((it: Partial<ItemLite> | undefined | null) => {
    if (!it) return;
    if (it.priceSell != null) setUnitPrice(Number(it.priceSell));
    if (it.unit) setUnit(it.unit);
  }, []);

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
        if (
          Number.isFinite(id) &&
          !selectedNameById.has(id) &&
          !catalogNameById.has(id) &&
          !lazyNames.has(id)
        ) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  /* ---------- Printing helpers (client-side receipt) ---------- */
  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[m]
    );
  }

  const printReceiptForShift = React.useCallback(
    async (opts?: { singleItemId?: number }) => {
      // Try to fetch a fresh summary for the shift so the receipt is reliable
      let bodySummary: ShiftSummary | null = summary ?? null;
      if (shift?.id) {
        try {
          bodySummary = (await SalesApi.getShiftSummary(shift.id)) as unknown as ShiftSummary;
        } catch {
          // ignore and fallback to existing summary
        }
      }

      const lines = (bodySummary?.byItem ?? []).filter((r) =>
        opts?.singleItemId ? Number(r.itemId) === Number(opts.singleItemId) : true
      );

      const total = toNum(bodySummary?.totals?.cashDue ?? 0);

      const tillNumber = process.env.NEXT_PUBLIC_TILL_NUMBER ?? "TILL-001";
      const waiterName = empNameById.get(employeeId) ?? employeeQuery ?? `#${employeeId}`;

      // branded, hotel-grade receipt + developer credit
      const printable = `
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt</title>
        <style>
          body{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; margin: 8px; color:#111;}
          .receipt{ width: 320px; max-width: 320px; }
          h2{ margin:0; font-size:16px; text-align:center; color:#064e3b; letter-spacing:0.2px; }
          .meta{ font-size:11px; margin:6px 0; text-align:center; color:#6b7280; }
          table{ width:100%; border-collapse: collapse; font-size:13px; margin-top:6px;}
          td{ padding:6px 0; vertical-align:top; }
          .qty{ width:14%; text-align:left; font-weight:600; color:#0f172a; }
          .name{ width:56%; text-align:left; padding-left:6px; color:#111827; }
          .price{ width:30%; text-align:right; color:#065f46; font-weight:700; }
          .total { font-weight:800; font-size:16px; margin-top:10px; text-align:right; color:#0f172a; }
          .center{ text-align:center; margin-top:8px; font-size:12px; color:#374151; }
          hr{ border: none; border-top:1px solid #e6f4ea; margin:8px 0; }
          .till{ margin-top:8px; text-align:center; font-size:13px; color:#065f46; font-weight:700; }
          .devcredit{ margin-top:10px; text-align:center; font-size:11px; color:#475569; border-top:1px dashed #e6eef0; padding-top:8px;}
          @media print { body{ margin:0; } .receipt{ width: 80mm; } }
        </style>
      </head>
      <body>
      <div class="receipt">
        <h2>Globe Organic Kitchen</h2>
        <div class="meta">${new Date().toLocaleString()}</div>
        <div class="meta">Shift: ${escapeHtml(String(shift?.id ?? "—"))} • Waiter: ${escapeHtml(String(waiterName ?? "—"))}</div>
        <hr/>
        <table>
          ${lines
            .map(
              (l) =>
                `<tr><td class="qty">${escapeHtml(String(toNum((l as any).sold) || 1))}</td><td class="name">${escapeHtml(
                  resolveItemName(l.itemId)
                )}${l.unit ? " • " + escapeHtml(String(l.unit)) : ""}</td><td class="price">${fmtMoney((l as any).cashDue ?? (l as any).price ?? 0)}</td></tr>`
            )
            .join("")}
        </table>
        <hr/>
        <div class="total">TOTAL: ${fmtMoney(total)}</div>
        <div class="till">Till: ${escapeHtml(tillNumber)}</div>
        <div class="center">Thank you — Please visit again</div>
        <div class="devcredit">System developers: Hotel gurus call. 0790472773</div>
      </div>
      </body>
      </html>
      `;
      const w = window.open("", "_blank", "width=420,height=640");
      if (!w) {
        flash("error", "Pop-up blocked. Allow pop-ups to print receipts.");
        return;
      }
      w.document.write(printable);
      w.document.close();
      setTimeout(() => {
        try {
          w.print();
        } catch {
          // ignore
        }
      }, 400);
    },
    [shift, summary, employeeId, employeeQuery, empNameById, flash, resolveItemName]
  );

  const printSummary = React.useCallback(() => window.print(), []);

  /* ---------- keyboard shortcuts & touch-friendly helpers ---------- */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd + P => print summary (kiosk: may still open print dialog)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        printSummary();
      }

      // If Enter pressed while item input focused, finalize typed item (mobile keyboards)
      if (e.key === "Enter") {
        const active = document.activeElement as HTMLElement | null;
        if (active?.id === "itemName") {
          // finalize typed item to pick from fuzzy match
          finalizeTypedItem();
        }
      }

      // Ctrl+Enter to add sale (quick shortcut)
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (canAddSale) {
          e.preventDefault();
          mAddSale.mutate();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finalizeTypedItem, canAddSale, mAddSale, printSummary]);

  /* ---------- auto-fill price + unit when picking an item ---------- */
  React.useEffect(() => {
    // If itemQuery matches an item from menuItems, auto-pick
    const match = menuItems.find((it: any) => `${it.name} (#${it.id})` === itemQuery || it.name === itemQuery);
    if (match) handleItemPicked(match as ItemLite);
  }, [itemQuery, menuItems, handleItemPicked]);

  /* ---------- Lazy fetch names missing in summary (kept as original) ---------- */
  React.useEffect(() => {
    (async () => {
      if (!summary?.byItem?.length) return;
      const missingIds: number[] = [];
      for (const row of summary.byItem) {
        const id = Number(row.itemId);
        if (
          Number.isFinite(id) &&
          !selectedNameById.has(id) &&
          !catalogNameById.has(id) &&
          !lazyNames.has(id)
        ) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  /* ---------- clock (for header) ---------- */
  /* ---------- clock (client-only, prevents hydration mismatch) ---------- */
/* Start as null so server renders the same HTML every time (no time text).
   On the client we set the live time+date inside useEffect. */
const [clock, setClock] = React.useState<{ time: string; date: string } | null>(null);

React.useEffect(() => {
  const fmtTime = () => new Date().toLocaleTimeString();
  const fmtDate = () => new Date().toLocaleDateString("en-CA"); // stable YYYY-MM-DD style
  // set initial value once client has mounted
  setClock({ time: fmtTime(), date: fmtDate() });

  const t = setInterval(() => setClock({ time: fmtTime(), date: fmtDate() }), 1000);
  return () => clearInterval(t);
}, []);


  /* ---------- kiosk mode detection ---------- */
  const [kioskMode, setKioskMode] = React.useState(false);
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setKioskMode(params.get("kiosk") === "1");
    } catch {
      setKioskMode(false);
    }
  }, []);

  /* ---------- UI ---------- */

  // If kioskMode: render simplified full-screen POS (no DashboardShell)
  if (kioskMode) {
    return (
      <div className="min-h-screen bg-emerald-50 p-4">
        <div className="max-w-[1200px] mx-auto">
          {/* Header (compact) */}
          <header className="flex items-center gap-4 mb-4">
            <div className="rounded-full bg-white p-3 shadow-sm border">
              <Search className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-slate-900">POS — Inside Waiters</h1>
              <div className="text-sm text-slate-600">
                {clock ? `${clock.time} • ${clock.date}` : "—"}
              </div>

            </div>
            <div className="ml-auto">
              <button
                onClick={() => window.location.assign("/")}
                className="rounded-lg px-3 py-2 bg-white border hover:bg-emerald-50"
              >
                Exit Kiosk
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
            {/* Left */}
            <aside className="space-y-4">
              <div className="rounded-xl border p-4 bg-white/90 backdrop-blur-sm shadow-lg">
                <div className="text-xs text-slate-500">Current Shift</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <div className="text-lg font-semibold text-slate-900">{shift ? `#${shift.id}` : "—"}</div>
                  <div className="text-sm text-slate-600">{shift ? (isClosed ? "CLOSED" : "OPEN") : "No shift"}</div>
                </div>
                <div className="text-xs text-slate-500 mt-2">Employee</div>
                <div className="text-sm font-medium">{empNameById.get(Number(shift?.employeeId)) ?? (shift?.employeeId ? `#${shift.employeeId}` : "—")}</div>
                <div className="text-xs text-slate-400 mt-2">Cash Due</div>
                <div className="text-2xl font-bold text-emerald-700">₵ {fmtMoney(summary?.totals?.cashDue ?? 0)}</div>

                <div className="mt-4 grid gap-2">
                  <button
                    onClick={() => mGetOrOpen.mutate()}
                    disabled={!canGetShift}
                    className="w-full rounded-lg px-4 py-3 text-white bg-emerald-600 hover:bg-emerald-700 shadow disabled:opacity-60"
                  >
                    {mGetOrOpen.isPending ? "Loading..." : shift ? "Switch Shift" : "Get Shift"}
                  </button>
                  <button
                    type="button"
                    onClick={() => mSaveCashup.mutate()}
                    disabled={!shift || !summary || mSaveCashup.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 bg-white border hover:bg-emerald-50"
                  >
                    <Save className="w-4 h-4 text-emerald-600" />
                    Save Cash-up
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!shift) { flash("error", "Open a shift first."); return; }
                      printReceiptForShift();
                    }}
                    disabled={!shift}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 bg-white border hover:bg-emerald-50"
                  >
                    <Printer className="w-4 h-4 text-emerald-600" />
                    Print Receipt
                  </button>
                </div>
              </div>
            </aside>

            {/* Right: main */}
            <main>
              {/* Get/Open shift card */}
              <div className="rounded-xl border p-4 bg-white/90 backdrop-blur-sm shadow-lg mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,420px)_200px_140px_1fr] gap-3 items-end">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Employee</label>
                    <input
                      className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      placeholder="Type name…"
                      value={employeeQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEmployeeQuery(v);
                        const match = employees.find((emp) => `${emp.name} (#${emp.id})` === v || emp.name === v);
                        if (match) setEmployeeId(match.id);
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Waiter Type</label>
                    <select
                      className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      value={waiterType}
                      onChange={(e) => setWaiterType(e.target.value as "INSIDE" | "FIELD")}
                    >
                      <option value="INSIDE">INSIDE</option>
                      <option value="FIELD">FIELD</option>
                    </select>
                  </div>

                  <div className="flex items-center">
                    <button
                      onClick={() => mGetOrOpen.mutate()}
                      disabled={!canGetShift}
                      className="w-full rounded-lg px-4 py-3 text-white bg-emerald-600 hover:bg-emerald-700 shadow disabled:opacity-60"
                    >
                      {mGetOrOpen.isPending ? "Loading..." : shift ? "Get / Open Shift" : "Get Shift"}
                    </button>
                  </div>

                  <div className="text-right text-sm text-slate-600">
                    <div><strong>Shift #{shift?.id ?? "—"}</strong></div>
                    <div className="mt-1">{isClosed ? "CLOSED" : "OPEN"} • {String((shift as any)?.date ?? todayStr()).slice(0,10)}</div>
                  </div>
                </div>
              </div>

              {/* Quick SALE entry card */}
              <div className="rounded-xl border p-4 bg-white/90 backdrop-blur-sm shadow-lg">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!itemId && itemQuery) finalizeTypedItem();
                    if (canAddSale) mAddSale.mutate();
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,420px)_repeat(3,1fr)_minmax(160px,1fr)] gap-3">
                    {/* Item search */}
                    <div>
                      <label className="text-sm font-medium text-slate-700">Item</label>
                      <input
                        list="menu-items-list"
                        className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        placeholder="Type to search…"
                        value={itemQuery}
                        onChange={(e) => {
                          const v = e.target.value;
                          setItemQuery(v);
                          const match = menuItems.find(
                            (it: { name: string; id: any }) => `${it.name} (#${it.id})` === v || it.name === v
                          );
                          if (match) handleItemPicked(match as ItemLite);
                        }}
                        onBlur={finalizeTypedItem}
                        disabled={!shift || isClosed}
                        autoFocus
                      />
                      <datalist id="menu-items-list">
                        {menuItems.map((it: { id: React.Key | null | undefined; name: any }) => (
                          <option key={it.id} value={`${it.name} (#${it.id})`} />
                        ))}
                      </datalist>
                      <p className="mt-1 text-xs text-slate-500">{itemId ? `Selected: ${resolveItemName(itemId)} (#${itemId})` : "Pick an item"}</p>
                    </div>

                    {/* Qty */}
                    <div>
                      <label className="text-sm font-medium text-slate-700">Qty</label>
                      <input
                        id="qty"
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step="0.01"
                        value={qty}
                        onChange={(e) => setQty(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        disabled={!shift || isClosed}
                      />
                    </div>

                    {/* Unit */}
                    <div>
                      <label className="text-sm font-medium text-slate-700">Unit</label>
                      <input
                        id="unit"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        placeholder="plate / bottle / glass"
                        disabled={!shift || isClosed}
                      />
                    </div>

                    {/* Unit Price */}
                    <div>
                      <label className="text-sm font-medium text-slate-700">Unit Price</label>
                      <input
                        id="unitPrice"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={unitPrice || ""}
                        onChange={(e) => setUnitPrice(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                        placeholder="e.g. 80"
                        disabled={!shift || isClosed}
                      />
                      <p className="mt-1 text-xs text-slate-500">Auto-filled from menu when you pick an item.</p>
                    </div>

                    {/* Live Line Total */}
                    <div className="rounded-lg border p-4 flex items-center justify-between bg-emerald-50">
                      <div className="text-sm text-slate-700">Line Total</div>
                      <div className="text-2xl font-semibold tabular-nums text-emerald-700">{fmtMoney(lineTotal)}</div>
                    </div>

                    {/* Table + submit */}
                    <div className="xl:col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-slate-700">Table (inside only)</label>
                        <input
                          id="tableCode"
                          value={tableCode}
                          onChange={(e) => setTableCode(e.target.value)}
                          className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                          placeholder="A6 / A7…"
                          disabled={!shift || isClosed}
                        />
                      </div>
                      <div className="flex items-end gap-3">
                        <button
                          type="submit"
                          disabled={!canAddSale}
                          className="w-full sm:w-auto rounded-lg px-6 py-3 text-white bg-emerald-600 hover:bg-emerald-700 shadow disabled:opacity-60 transition-transform active:scale-95"
                          aria-busy={mAddSale.isPending}
                        >
                          {mAddSale.isPending ? "Adding…" : "Add SALE line"}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!shift) {
                              flash("error", "Open a shift to print a receipt.");
                              return;
                            }
                            printReceiptForShift();
                          }}
                          disabled={!shift}
                          className="rounded-lg px-6 py-3 border bg-white hover:bg-emerald-50"
                        >
                          <Printer className="inline-block w-4 h-4 mr-2 -mt-1 text-emerald-600" />
                          <span className="text-sm">Print Receipt</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </form>

                {/* Inline feedback */}
                <div className="mt-3 min-h-[1.4rem]">
                  {mAddSale.isError && <div className="text-sm text-red-600">Failed to add line. Check values and try again.</div>}
                  {mAddSale.isSuccess && <div className="text-sm text-emerald-700">Line added.</div>}
                  {mSaveCashup.isError && <div className="text-sm text-red-600">Failed to save cash-up. Please try again.</div>}
                  {mSaveCashup.isSuccess && <div className="text-sm text-emerald-700">Cash-up snapshot saved.</div>}
                  {mCloseShift.isError && <div className="text-sm text-red-600">Failed to close shift. Please try again.</div>}
                  {mCloseShift.isSuccess && <div className="text-sm text-emerald-700">Shift closed. Use "Get Shift" to open a new one.</div>}
                  {mGetOrOpen.isError && <div className="text-sm text-red-600">Couldn’t get/open a shift. Pick an employee from the list and try again.</div>}
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  // Normal mode (inside DashboardShell)
  return (
    <DashboardShell>
      {/* Top ephemeral message area (toast-like) */}
      <div className="fixed left-1/2 -translate-x-1/2 top-6 z-50 pointer-events-none">
        {topMessage && (
          <div
            className={`pointer-events-auto px-4 py-2 rounded-lg shadow-md transition-transform ${
              topMessage.type === "error"
                ? "bg-red-600 text-white"
                : topMessage.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-white"
            }`}
          >
            <div className="text-sm">{topMessage.text}</div>
          </div>
        )}
      </div>

      {/* Page header */}
      <div className="mb-6">
        <div className="rounded-2xl p-4 bg-gradient-to-r from-emerald-50 to-white border border-emerald-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-white p-3 shadow-sm border">
              <Search className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-slate-900">Daily Sales</h1>
              <p className="text-sm text-slate-600">Fast POS for inside waiters — open shift, add items, print receipts.</p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="text-right mr-2 hidden sm:block">
                <div className="text-xs text-slate-500">Today</div>
                <div className="text-sm font-medium text-slate-800">{todayStr()}</div>
                <div className="text-sm text-slate-600">
                  {clock ? `${clock.time} • ${clock.date}` : ""}
                </div>


              </div>

              <button
                onClick={() => setShowByEmployee((s) => !s)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border bg-white hover:bg-emerald-50 shadow-sm"
              >
                <User2 className="w-4 h-4 text-emerald-600" />
                <span className="text-sm">By Employee</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showByEmployee ? "rotate-180" : ""}`} />
              </button>
              <button
                onClick={() => setShowDaily((s) => !s)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border bg-white hover:bg-emerald-50 shadow-sm"
              >
                <History className="w-4 h-4 text-emerald-600" />
                <span className="text-sm">Daily Rollup</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showDaily ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout: left summary / right main form */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* LEFT: Summary & Quick actions */}
        <aside className="space-y-4">
          <div className="rounded-xl border p-4 bg-white shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-xs text-slate-500">Current Shift</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <div className="text-lg font-semibold text-slate-900">
                    {shift ? `#${shift.id}` : "—"}
                  </div>
                  <div className="text-sm text-slate-600">{shift ? (isClosed ? "CLOSED" : "OPEN") : "No shift"}</div>
                </div>
                <div className="text-xs text-slate-500 mt-1">Employee</div>
                <div className="text-sm font-medium">{empNameById.get(Number(shift?.employeeId)) ?? (shift?.employeeId ? `#${shift.employeeId}` : "—")}</div>
                <div className="text-xs text-slate-400 mt-2">Cash Due</div>
                <div className="text-2xl font-bold text-emerald-700">₵ {fmtMoney(summary?.totals?.cashDue ?? 0)}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => mSaveCashup.mutate()}
                disabled={!shift || !summary || mSaveCashup.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span className="text-sm">{mSaveCashup.isPending ? "Saving…" : "Save Cash-up"}</span>
              </button>

              <button
                type="button"
                onClick={() => printReceiptForShift()}
                disabled={!shift}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 border bg-white hover:bg-emerald-50"
              >
                <Printer className="w-4 h-4 text-emerald-600" />
                <span className="text-sm">Print Receipt</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!canCloseShift) return;
                  if (window.confirm(`Close shift #${shift?.id ?? ""}?`)) mCloseShift.mutate();
                }}
                disabled={!canCloseShift}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                <XCircle className="w-4 h-4" />
                <span className="text-sm">{mCloseShift.isPending ? "Closing…" : "Close Shift"}</span>
              </button>
            </div>
          </div>

          {/* Today by employee — collapsible */}
          {showByEmployee && (
            <div className="rounded-xl border p-3 bg-white shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Today by Employee</div>
                <div className="text-xs text-slate-500">{todaysShifts?.data?.length ?? 0} shifts</div>
              </div>

              <div className="mt-3 space-y-2">
                {!(todaysShifts?.data?.length ?? 0) ? (
                  <div className="text-sm text-slate-500">No shifts yet today.</div>
                ) : (
                  Array.from(
                    new Map(((todaysShifts?.data ?? []) as any[]).map((s) => [Number(s.employeeId), true] as const)).keys()
                  )
                    .sort((a, b) => {
                      const an = empNameById.get(a) ?? `#${a}`;
                      const bn = empNameById.get(b) ?? `#${b}`;
                      return an.localeCompare(bn);
                    })
                    .map((empId) => {
                      const name = empNameById.get(empId) ?? `Employee #${empId}`;
                      const shifts = ((todaysShifts?.data ?? []) as any[]).filter((s) => Number(s.employeeId) === empId);
                      const empTotal = totalsByEmployee.get(empId) ?? 0;
                      return (
                        <div key={empId} className="border rounded-lg p-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">{name}</div>
                            <div className="text-sm font-semibold tabular-nums">₵ {fmtMoney(empTotal)}</div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {shifts.map((s: any) => {
                              const total = shiftTotalById.get(Number(s.id)) ?? 0;
                              const closed = !!s.closedAt;
                              return (
                                <button
                                  key={s.id}
                                  onClick={() =>
                                    setShift({
                                      id: Number(s.id),
                                      date: String(s.date).slice(0, 10),
                                      employeeId: Number(s.employeeId),
                                      status: closed ? "CLOSED" : "OPEN",
                                      closedAt: s.closedAt ?? null,
                                      cashExpected: 0,
                                      cashReceived: 0,
                                      shortOver: 0,
                                      lines: [],
                                    } as any)
                                  }
                                  className={`px-2 py-1 rounded-full text-xs border ${
                                    shift?.id === s.id ? "bg-emerald-50 border-emerald-200" : "bg-white hover:bg-emerald-50"
                                  }`}
                                  title={`Shift #${s.id} • ${closed ? "CLOSED" : "OPEN"}`}
                                >
                                  #{s.id} • {closed ? "CLOSED" : "OPEN"} • ₵ {fmtMoney(total)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          )}

          {/* Cashups when expanded */}
          {expandedEmp != null && (
            <div className="rounded-xl border p-3 bg-white shadow-sm">
              <div className="text-sm font-semibold">Cash-up Snapshots</div>
              <div className="mt-2">
                {qEmpCashups.isFetching ? (
                  <div className="text-sm text-slate-500">Loading…</div>
                ) : (qEmpCashups.data?.data?.length ?? 0) === 0 ? (
                  <div className="text-sm text-slate-500">No snapshots for today.</div>
                ) : (
                  qEmpCashups.data!.data.map((row: any) => (
                    <div key={row.id} className="border rounded p-2 mb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-500">Cashup #{row.id} • Shift #{row.shiftId}</div>
                        <pre className="mt-1 text-xs whitespace-pre-wrap break-words max-h-32 overflow-auto">
                          {JSON.stringify(row.snapshot?.summary ?? row.snapshot, null, 2)}
                        </pre>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-emerald-50 text-xs"
                          onClick={() => mDeleteCashup.mutate(row.id)}
                          disabled={mDeleteCashup.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                        {mDeleteCashup.isError && <div className="text-xs text-red-600">Failed to delete.</div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </aside>

        {/* RIGHT: Main form & summary table */}
        <main>
          {/* Get/Open shift */}
          <div className="rounded-xl border p-4 bg-white shadow-sm mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,420px)_200px_140px_1fr] gap-3 items-end">
              <div>
                <label htmlFor="employeeName" className="text-sm font-medium text-slate-700">
                  Employee
                </label>
                <input
                  id="employeeName"
                  list="employee-list"
                  className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Type name…"
                  value={employeeQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEmployeeQuery(v);
                    const match = employees.find((emp) => `${emp.name} (#${emp.id})` === v || emp.name === v);
                    if (match) setEmployeeId(match.id);
                  }}
                  onBlur={() => {
                    const match = employees.find((emp) => `${emp.name} (#${emp.id})` === employeeQuery || emp.name === employeeQuery);
                    if (match) setEmployeeId(match.id);
                  }}
                  disabled={!!shift && (shift as any)?.closedAt == null}
                />
                <datalist id="employee-list">{employees.map((e) => (<option key={e.id} value={`${e.name} (#${e.id})`} />))}</datalist>
                <p className="mt-1 text-xs text-slate-500">{employeeId ? `Selected ID: ${employeeId}` : "Pick an employee"}</p>
              </div>

              <div>
                <label htmlFor="waiterType" className="text-sm font-medium text-slate-700">Waiter Type</label>
                <select
                  id="waiterType"
                  className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  value={waiterType}
                  onChange={(e) => setWaiterType(e.target.value as "INSIDE" | "FIELD")}
                  disabled={!!shift && (shift as any)?.closedAt == null}
                >
                  <option value="INSIDE">INSIDE</option>
                  <option value="FIELD">FIELD</option>
                </select>
              </div>

              <div className="flex items-center">
                <button
                  onClick={() => mGetOrOpen.mutate()}
                  disabled={!canGetShift}
                  className="w-full rounded-lg px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 shadow disabled:opacity-60"
                  aria-busy={mGetOrOpen.isPending}
                >
                  {mGetOrOpen.isPending ? "Loading..." : shift ? "Get / Open Shift" : "Get Shift"}
                </button>
              </div>

              {shift && (
                <div className="text-right text-sm text-slate-600">
                  <div><strong>Shift #{shift.id}</strong></div>
                  <div className="mt-1">{isClosed ? "CLOSED" : "OPEN"} • {String((shift as any)?.date ?? todayStr()).slice(0,10)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Quick SALE entry card */}
          <div className="rounded-xl border p-4 bg-white shadow-sm mb-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!itemId && itemQuery) finalizeTypedItem();
                if (canAddSale) mAddSale.mutate();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,420px)_repeat(3,1fr)_minmax(160px,1fr)] gap-3">
                {/* Item search */}
                <div>
                  <label htmlFor="itemName" className="text-sm font-medium text-slate-700">Item</label>
                  <input
                    id="itemName"
                    list="menu-items-list"
                    className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder="Type to search…"
                    value={itemQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setItemQuery(v);
                      const match = menuItems.find(
                        (it: { name: string; id: any }) => `${it.name} (#${it.id})` === v || it.name === v
                      );
                      if (match) handleItemPicked(match as ItemLite);
                    }}
                    onBlur={finalizeTypedItem}
                    disabled={!shift || isClosed}
                    autoFocus
                  />
                  <datalist id="menu-items-list">
                    {menuItems.map((it: { id: React.Key | null | undefined; name: any }) => (
                      <option key={it.id} value={`${it.name} (#${it.id})`} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-slate-500">{itemId ? `Selected: ${resolveItemName(itemId)} (#${itemId})` : "Pick an item"}</p>
                </div>

                {/* Qty */}
                <div>
                  <label htmlFor="qty" className="text-sm font-medium text-slate-700">Qty</label>
                  <input
                    id="qty"
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step="0.01"
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    disabled={!shift || isClosed}
                  />
                </div>

                {/* Unit */}
                <div>
                  <label htmlFor="unit" className="text-sm font-medium text-slate-700">Unit</label>
                  <input
                    id="unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder="plate / bottle / glass"
                    disabled={!shift || isClosed}
                  />
                </div>

                {/* Unit Price */}
                <div>
                  <label htmlFor="unitPrice" className="text-sm font-medium text-slate-700">Unit Price</label>
                  <input
                    id="unitPrice"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={unitPrice || ""}
                    onChange={(e) => setUnitPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder="e.g. 80"
                    disabled={!shift || isClosed}
                  />
                  <p className="mt-1 text-xs text-slate-500">Auto-filled from menu when you pick an item.</p>
                </div>

                {/* Live Line Total */}
                <div className="rounded-lg border p-4 flex items-center justify-between bg-emerald-50">
                  <div className="text-sm text-slate-700">Line Total</div>
                  <div className="text-2xl font-semibold tabular-nums text-emerald-700">{fmtMoney(lineTotal)}</div>
                </div>

                {/* Table + submit */}
                <div className="xl:col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tableCode" className="text-sm font-medium text-slate-700">Table (inside only)</label>
                    <input
                      id="tableCode"
                      value={tableCode}
                      onChange={(e) => setTableCode(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      placeholder="A6 / A7…"
                      disabled={!shift || isClosed}
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <button
                      type="submit"
                      disabled={!canAddSale}
                      className="w-full sm:w-auto rounded-lg px-6 py-3 text-white bg-emerald-600 hover:bg-emerald-700 shadow disabled:opacity-60"
                      aria-busy={mAddSale.isPending}
                    >
                      {mAddSale.isPending ? "Adding…" : "Add SALE line"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!shift) {
                          flash("error", "Open a shift to print a receipt.");
                          return;
                        }
                        printReceiptForShift();
                      }}
                      disabled={!shift}
                      className="rounded-lg px-6 py-3 border bg-white hover:bg-emerald-50"
                    >
                      <Printer className="inline-block w-4 h-4 mr-2 -mt-1 text-emerald-600" />
                      <span className="text-sm">Print Receipt</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>

            {/* Inline feedback */}
            <div className="mt-3 min-h-[1.4rem]">
              {mAddSale.isError && <div className="text-sm text-red-600">Failed to add line. Check values and try again.</div>}
              {mAddSale.isSuccess && <div className="text-sm text-emerald-700">Line added.</div>}
              {mSaveCashup.isError && <div className="text-sm text-red-600">Failed to save cash-up. Please try again.</div>}
              {mSaveCashup.isSuccess && <div className="text-sm text-emerald-700">Cash-up snapshot saved.</div>}
              {mCloseShift.isError && <div className="text-sm text-red-600">Failed to close shift. Please try again.</div>}
              {mCloseShift.isSuccess && <div className="text-sm text-emerald-700">Shift closed. Use "Get Shift" to open a new one.</div>}
              {mGetOrOpen.isError && <div className="text-sm text-red-600">Couldn’t get/open a shift. Pick an employee from the list and try again.</div>}
            </div>
          </div>

          {/* Daily rollup (whole day) */}
          {showDaily && (
            <div className="rounded-xl border p-4 bg-white shadow-sm mb-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-lg font-semibold text-slate-800">Daily Rollup ({todayStr()})</h2>
                {qDaily.data && (
                  <div className="text-sm text-slate-600">
                    Lines: <strong>{toNum(qDaily.data.totals.lines)}</strong> • Cash Due: <strong>{fmtMoney(qDaily.data.totals.cashDue)}</strong>
                  </div>
                )}
              </div>

              {!qDaily.isFetching && qDaily.data === null ? (
                <p className="text-sm text-slate-500">Daily rollup endpoint not available yet on the server.</p>
              ) : qDaily.isFetching ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : qDaily.data?.byItem?.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-[720px] w-full border rounded-lg">
                    <thead className="bg-emerald-50">
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
                <p className="text-sm text-slate-500">No sales yet today.</p>
              )}
            </div>
          )}

          {/* Cash-up snapshot viewer (current shift) */}
          {showCashup && shift && (
            <div className="rounded-xl border p-4 bg-white shadow-sm mb-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="text-lg font-semibold text-slate-800">Cash-up Snapshot (Shift #{shift.id})</h2>
              </div>

              {qCashup.isFetching ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : qCashup.isError ? (
                <p className="text-sm text-red-600">
                  Couldn’t load snapshot{(qCashup.error as any)?.message ? `: ${(qCashup.error as any).message}` : "."}
                </p>
              ) : qCashup.data == null ? (
                <p className="text-sm text-slate-500">No snapshot found.</p>
              ) : (
                <div className="rounded-lg border p-3 text-sm">
                  {(() => {
                    const data: any = qCashup.data;
                    if (data && typeof data === "object" && "snapshot" in data) {
                      return <pre className="whitespace-pre-wrap break-words">{JSON.stringify(data.snapshot, null, 2)}</pre>;
                    }
                    const snaps = Array.isArray(data?.snapshots) ? data.snapshots : [];
                    if (snaps.length > 0) {
                      return (
                        <div className="space-y-3">
                          {snaps.map((s: any, i: number) => (
                            <div key={i} className="rounded-lg border p-2">
                              <div className="text-slate-500 mb-1">Saved at: {s.at}</div>
                              <pre className="whitespace-pre-wrap break-words">{JSON.stringify(s.payload, null, 2)}</pre>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return <div className="text-slate-500">No snapshot found.</div>;
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Summary (current shift) */}
          <div className="rounded-xl border p-4 bg-white shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <h2 className="text-lg font-semibold text-slate-800">Summary</h2>
              {summary && (
                <div className="text-sm text-slate-600">
                  Lines: <strong>{toNum(summary.totals.lines)}</strong> • Cash Due: <strong>{fmtMoney(summary.totals.cashDue)}</strong>
                </div>
              )}
            </div>

            {!shift ? (
              <p className="text-sm text-slate-500">Get a shift to see totals.</p>
            ) : isFetching ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : summary?.byItem?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-[720px] w-full border rounded-lg">
                  <thead className="bg-emerald-50">
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
                      <td colSpan={8} className="px-3 py-2 text-right">Total</td>
                      <td className="px-3 py-2">{fmtMoney(summary.totals.cashDue)}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-3 text-xs text-slate-500">
                  Shift #{shift?.id} • {String((shift as any)?.date ?? todayStr()).slice(0, 10)} • Employee ID: {employeeId || "—"}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No lines yet.</p>
            )}
          </div>
        </main>
      </div>
    </DashboardShell>
  );
}
