// apps/web/lib/fieldEndpoints.ts
// Centralized endpoints for Field Work + related helpers.

export const ENDPOINTS = {
  /* Employees */
  employeesPaged: "/employees",

  /* Menu Items quick list (for dropdowns) */
  menuItemsQuick: "/menu-items",

  /* Field Dispatch */
  dispatchCreate: "/field-dispatch",

  // Preferred (and now implemented) endpoint for today's lines:
  //   GET /api/field-dispatch/today?waiterId=&date=YYYY-MM-DD
  dispatchListToday: (waiterId?: number, dateISO?: string) => {
    const params = new URLSearchParams();
    if (waiterId) params.set("waiterId", String(waiterId));
    if (dateISO) params.set("date", dateISO);
    const qs = params.toString();
    return `/field-dispatch/today${qs ? `?${qs}` : ""}`;
  },

  // Generic fetch (kept)
  dispatchGet: (id: number) => `/field-dispatch/${id}`,

  /* Field Return */
  // Return is per dispatch line
  returnCreateForDispatch: (dispatchId: number) =>
    `/field-dispatch/${dispatchId}/return`,

  // Optional list for a given day/waiter (not required by current UI)
  returnListDay: (dateISO: string, waiterId?: number) =>
    waiterId
      ? `/field-return?date=${dateISO}&waiterId=${waiterId}`
      : `/field-return?date=${dateISO}`,

  /* Field Commission (preview/apply) — available for dashboards/payroll */
  fieldPreviewToday: (empId: number) => `/commission/field/today/${empId}`,
  fieldApplyToday: "/commission/field/apply",

  /* Salary deductions — for short cash shots (LOSS) */
  salaryDeductions: "/salary-deductions", // POST { employeeId, amount, reason:'LOSS', note? }

  /* Printing (placeholder) */
  ordersPrint: (orderId: number) => `/orders/${orderId}/print`,
} as const;
