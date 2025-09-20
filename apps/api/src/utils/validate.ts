import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

/** Validate req.body against a Zod schema; returns 400 on failure. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => ({
        path: i.path.join("."),
        message: i.message,
        code: i.code,
      }));
      return res.status(400).json({ error: "validation_failed", issues });
    }
    // store parsed, typed data back on req.body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).body = parsed.data;
    next();
  };
}
