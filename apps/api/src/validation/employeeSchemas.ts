import { z } from "zod";

// shared
export const roleEnum = z.string().min(1); // or z.enum(["WAITER","CHEF","CASHIER","MANAGER"])
export const typeEnum = z.enum(["INSIDE", "OUTSIDE"]);

export const CreateEmployeeSchema = z.object({
  name: z.string().min(2),
  role: roleEnum,
  type: typeEnum,
  tableCode: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  // 👇 Option A: optional salaryMonthly as string with 2 decimals
  salaryMonthly: z
    .string()
    .regex(/^\d+(\.\d{2})?$/, "must be a string with 2 decimals e.g. 35000.00")
    .optional(),
  active: z.boolean().optional(),
});

export const UpdateEmployeeSchema = z.object({
  name: z.string().min(2).optional(),
  role: roleEnum.optional(),
  type: typeEnum.optional(),
  tableCode: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  // Optional on update too
  salaryMonthly: z
    .string()
    .regex(/^\d+(\.\d{2})?$/, "must be a string with 2 decimals e.g. 36000.00")
    .optional(),
  active: z.boolean().optional(),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
