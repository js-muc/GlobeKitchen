import { z } from "zod";

export const ZTableCode = z.enum(["A6", "A7", "A8", "A9"]);
export const ZMovementDirection = z.enum(["IN", "OUT"]);
export const ZEmployeeRole = z.enum([
  "WAITER",
  "CHEF",
  "CASHIER",
  "MANAGER",
  "KITCHEN",
]);
export const ZEmployeeType = z.enum(["INSIDE", "FIELD", "KITCHEN"]);

// Accept either strict RFC3339 string OR any parseable date (coerced)
const ZIsoOrDate = z.union([z.string().datetime(), z.coerce.date()]);

// Accept "35000.00" or 35000 (routes normalize to 2dp string)
const ZMoneyString = z.string().regex(/^\d+(\.\d{2})?$/);
const ZMoneyInput = z.union([ZMoneyString, z.number().finite().nonnegative()]).optional();

/* ------------------------- Items ------------------------- */
export const zItemCreate = z.object({
  name: z.string().min(1, "name required"),
  priceSell: z.number().nonnegative(),
  unit: z.string().min(1).default("unit"),
  category: z.string().nullable().optional(),
  costUnit: z.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
});

export const zItemUpdate = z.object({
  name: z.string().min(1).optional(),
  priceSell: z.number().nonnegative().optional(),
  unit: z.string().optional(),
  category: z.string().nullable().optional(),
  costUnit: z.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
});

/* ----------------------- Employees ----------------------- */
export const zEmployeeCreate = z.object({
  name: z.string().min(1, "name required"),
  role: ZEmployeeRole.default("WAITER"),
  type: ZEmployeeType.default("INSIDE"),
  tableCode: ZTableCode.nullable().optional(),
  phone: z.string().nullable().optional(),
  salaryMonthly: ZMoneyInput,            // ✅ NEW
  active: z.boolean().optional(),
});

export const zEmployeeUpdate = zEmployeeCreate.partial();

/* -------------------- Stock Movements -------------------- */
export const zStockMovementCreate = z.object({
  itemId: z.number().int().positive(),
  direction: ZMovementDirection,
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative().nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

/* ----------------------- Table Sales --------------------- */
export const zTableSaleCreate = z.object({
  date: ZIsoOrDate.optional(),
  waiterId: z.number().int().positive(),
  tableCode: ZTableCode,
  itemId: z.number().int().positive(),
  qty: z.number().positive(),
  priceEach: z.number().nonnegative(),
  discount: z.number().min(0).default(0),
  lossQty: z.number().min(0).default(0),
  note: z.string().max(200).nullable().optional(),
});

/* --------------------- Field Dispatch -------------------- */
export const zFieldDispatchCreate = z.object({
  date: ZIsoOrDate.optional(),
  waiterId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  qtyDispatched: z.number().positive(),
  priceEach: z.number().nonnegative(),
});

/* ---------------------- Field Return --------------------- */
export const zFieldReturnCreate = z.object({
  dispatchId: z.number().int().positive(),
  qtyReturned: z.number().nonnegative(),
  cashCollected: z.number().nonnegative().default(0),
  lossQty: z.number().int().nonnegative().default(0),
  note: z.string().max(200).nullable().optional(),
});
