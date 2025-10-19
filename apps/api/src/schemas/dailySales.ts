// apps/api/src/schemas/dailySales.ts
import { z } from "zod";

export const zCloseShift = z.object({
  cashReceived: z.number().nonnegative().optional(),  // cashier counted cash
  note: z.string().max(500).optional(),               // optional comment
  submit: z.boolean().optional(),                     // if your flow uses submit-before-close
  force: z.boolean().optional(),                      // allow force close (if you later enforce validations)
  submittedBy: z.union([z.number(), z.string()]).optional(),
});
