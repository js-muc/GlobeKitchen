// apps/web/lib/salesCompat.ts
// LABEL: SALES_COMPAT_V1
import * as Sales from "@/lib/api.sales";

export type Shift = Sales.Shift;

// Hard exports (these exist in your api.sales.ts)
export const listShifts = (Sales as any).listShifts as typeof Sales.listShifts;
export const listCashups = (Sales as any).listCashups as typeof Sales.listCashups;
export const getShiftSummary = (Sales as any).getShiftSummary as typeof Sales.getShiftSummary;
export const createCashup = (Sales as any).createCashup as typeof Sales.createCashup;

// Optional (may or may not exist in the service; keep original fallbacks)
export const createOrGetShift =
  (Sales as any).createOrGetShift as
    | ((args: {
        employeeId: number;
        date?: string;
        waiterType?: "INSIDE" | "FIELD";
        tableCode?: string;
      }) => Promise<Shift>)
    | undefined;

export const closeShift =
  (Sales as any).closeShift as ((id: number) => Promise<any>) | undefined;

// Unified add line: use whichever impl exists, preserve original server contract
export async function addShiftLine(
  shiftId: number,
  payload: {
    itemId: number;
    qty: number;
    unit: string;
    unitPrice: number;
    note?: string;
    type?: string;
  }
) {
  const fn =
    ((Sales as any).addShiftLine ?? (Sales as any).addSaleLine) as
      | ((body: any) => Promise<any>)
      | undefined;
  if (!fn) throw new Error("Sales API add line function missing.");

  return fn({
    shiftId,
    itemId: payload.itemId,
    qty: payload.qty,
    unit: payload.unit,
    unitPrice: payload.unitPrice,
    note: payload.note,
    type: payload.type,
  });
}

// Optional direct addSaleLine (some code paths expect this name)
export async function addSaleLine(body: {
  shiftId: number;
  itemId: number;
  qty: number;
  unitPrice: number;
  unit?: string;
  note?: string;
}) {
  const fn =
    ((Sales as any).addSaleLine ?? (Sales as any).addShiftLine) as
      | ((body: any) => Promise<any>)
      | undefined;
  if (!fn) throw new Error("Sales API add line function missing.");
  return fn(body);
}
