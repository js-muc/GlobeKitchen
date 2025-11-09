// routes/index.ts
import { Router } from "express";

// Core / existing
import auth from "./auth.js";
import items from "./item.js";
import employees from "./employees.js";
import reports from "./reports.js";
import stockMovements from "./stockMovements.js";
import tableSales from "./tableSales.js";
import fieldDispatch from "./fieldDispatch.js";
import fieldReturn from "./fieldReturn.js";
import dailySalesShiftsCompat from "./dailySalesShiftsCompat.js";

// Payroll & deductions
import salaryDeductions from "./salaryDeductions.js";
import payroll from "./payroll.js";

// Shifts & Stock
import shifts from "./shifts.js";
import stock from "./stock.js";

// ✅ Field worker split routes (were only mounted in server.ts)
import fieldDispatchCreate from "./fieldDispatchCreate.js";
import fieldDispatchList from "./fieldDispatchList.js";
import fieldDispatchReturn from "./fieldDispatchReturn.js";
import fieldDispatchGet from "./fieldDispatchGet.js";
import fieldCommissionDaily from "./fieldCommissionDaily.js";
import fieldCommissionMonthly from "./fieldCommissionMonthly.js";
import fieldSummary from "./fieldSummary.js";

// ✅ Menu items quick lookup (was only in server.ts)
import menuItemList from "./menuItemList.js";

// ✅ Inside waiter commission (new)
import commissionPlans from "./commissionPlans.js";

// ✅ Order receipt print (inside waiter flow)
import ordersPrintRouter from "./orders.print.js";

import { requireAdmin, adminForMutations } from "../middlewares/auth.js";

const r = Router({ mergeParams: true });

/**
 * Backwards-compatibility forwarding:
 * The codebase historically exposed legacy endpoints under /field-commission/*
 * which implemented static/legacy bracket logic. To unify computation and
 * use the canonical DB-driven commission router (commissionPlans), we rewrite
 * incoming requests that target the legacy paths so they reach the canonical handlers.
 *
 * Mapping rules:
 *  - /field-commission/daily       -> /commission/field/today (keeps daily semantics)
 *  - /field-commission/monthly     -> /commission/field/monthly
 *  - /field-commission/*            -> /commission/field/*
 *
 * This middleware is intentionally light-weight and defensive so it won't
 * break requests if anything goes wrong.
 */
r.use((req, _res, next) => {
  try {
    if (req.url && req.url.startsWith("/field-commission")) {
      // Map well-known legacy endpoints to canonical endpoints:
      req.url = req.url.replace(/^\/field-commission\/daily/, "/commission/field/today");
      req.url = req.url.replace(/^\/field-commission\/monthly/, "/commission/field/monthly");
      // General fallback: /field-commission/... -> /commission/field/...
      req.url = req.url.replace(/^\/field-commission/, "/commission/field");
    }
  } catch (err) {
    // swallow — do not block the request pipeline on routing helper errors
  }
  next();
});

/** For /api/health visibility */
const MOUNTS: string[] = [
  "/auth",
  "/items",
  "/employees",
  "/reports",
  "/stock-movements",
  "/table-sales",
  "/field-dispatch",
  "/field-return",
  "/salary-deductions",
  "/payroll",
  "/stock",
  "/shifts",
  "/daily-sales/shifts",
  "/daily-sales/shifts/for-employee",

  // Newly exposed mounts
  "/menu-items",
  "/field-dispatch/create",
  "/field-dispatch/list",
  "/field-dispatch/return",
  "/field-dispatch/get",
  "/field-commission/daily",
  "/field-commission/monthly",
  "/commission",

  // ✅ Receipt printing
  "/orders",
];

// Router-level health for this aggregator
r.get("/health", (_req, res) => {
  res.json({ ok: true, service: "routes", mounts: MOUNTS, ts: new Date().toISOString() });
});

/* ===== Public/auth ===== */
r.use("/auth", auth);

/* ===== Resources with mixed access (Public READ, Admin Mutations) =====
   - Public: GET /items, GET /items/:id
   - Admin-only: POST/PUT/PATCH/DELETE /items/...
   - Same for /employees
*/
r.use("/items", adminForMutations, items);
r.use("/employees", adminForMutations, employees);

/* ===== Admin-protected (back-office only) ===== */
r.use("/reports", requireAdmin, reports);
r.use("/table-sales", requireAdmin, tableSales);
r.use("/field-dispatch", requireAdmin, fieldDispatch);
r.use("/field-return", requireAdmin, fieldReturn);
r.use("/salary-deductions", requireAdmin, salaryDeductions);
r.use("/payroll", requireAdmin, payroll);
r.use("/shifts", requireAdmin, shifts);
r.use("/daily-sales/shifts", requireAdmin, shifts);
r.use("/daily-sales/shifts/for-employee", requireAdmin, dailySalesShiftsCompat);

r.use("/field-dispatch", fieldDispatch);

r.use("/field", fieldSummary); // mounts /api/field/...

/* ===== Public Stock & Movements (per agreement) ===== */
r.use("/stock-movements", stockMovements);
r.use("/stock", stock);

/* ===== Field worker APIs (kept open to match your server.ts usage) =====
   NOTE: these legacy mounts are left in place for compatibility. Because of the
   forwarding middleware above, requests sent to /field-commission/* will be
   handled by the canonical commission handlers (commissionPlans) — ensuring
   unified computation even if callers hit the legacy URLs.
*/
r.use("/field-dispatch/create", fieldDispatchCreate);
r.use("/field-dispatch/list", fieldDispatchList);
r.use("/field-dispatch/return", fieldDispatchReturn);
r.use("/field-dispatch/get", fieldDispatchGet);
r.use("/field-commission/daily", fieldCommissionDaily);
r.use("/field-commission/monthly", fieldCommissionMonthly);

/* ===== Menu items quick list (public) ===== */
r.use("/menu-items", menuItemList);

/* ===== Inside waiter commission endpoints (public read for plans; mutations likely admin inside that router) ===== */
r.use("/commission", commissionPlans);

/* ===== Order receipt print =====
   Mounted without requireAdmin so waiters can use it if its internal auth allows.
*/
r.use("/orders", ordersPrintRouter); // -> POST /api/orders/:id/print

export default r;
