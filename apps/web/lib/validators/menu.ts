// File: apps/web/lib/validators/menu.ts
// --------------------------------

import { z } from "zod";

export const menuItemSchema = z.object({
  name: z.string().min(2, "Name is required"),
  category: z.string().min(2, "Category is required"),
  unit: z.string().min(1, "Unit is required"),

  // Required number: must be finite and > 0
  priceSell: z
    .number({
      invalid_type_error: "Price must be a number",
      required_error: "Price is required",
    })
    .finite()
    .gt(0, "Price must be > 0"),

  // Optional / nullable number: when provided, must be >= 0
  // (UI will send undefined for empty; you can map undefined -> null before API)
  costUnit: z.number().nonnegative("Cost must be >= 0").nullable().optional(),

  // Optional boolean
  active: z.boolean().optional(),
});

export type MenuItemForm = z.infer<typeof menuItemSchema>;

// --------------------------------
