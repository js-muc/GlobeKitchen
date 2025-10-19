// apps/api/src/schemas/payroll.ts
import { z } from "zod";

export const zSalaryDeductionCreate = z.object({
  employeeId: z.coerce.number().int().positive(),
  date: z.coerce.date().optional(), // default now
  amount: z.union([z.string(), z.number()])
    .transform(v => String(v))
    .refine(v => Number(v) > 0, "amount must be > 0"),
  reason: z.enum(["ADVANCE", "BREAKAGE", "LOSS", "OTHER"]).default("ADVANCE"),
  note: z.string().max(300).optional().nullable(),
  // optional metadata, e.g. { itemId, saleId }
  meta: z.any().optional(),
});

export const zPayrollRunParams = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const zPayrollRerun = z.object({
  rerun: z.coerce.boolean().optional(),
});
