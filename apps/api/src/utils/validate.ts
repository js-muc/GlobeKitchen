// apps/api/src/utils/validate.ts
import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

/** Validate req.body against a Zod schema; returns 400 on failure (preserves original logic). */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      // Log once server-side with route context to make debugging easy
      // Includes the structured error plus the raw body (omit if too sensitive)
      // eslint-disable-next-line no-console
      console.error(
        `Zod validation failed: ${req.method} ${req.originalUrl}`,
        parsed.error.format()
      );

      const issues = parsed.error.issues.map((i) => ({
        path: i.path.length ? i.path.join(".") : "(root)",
        message: i.message,
        code: i.code,
        // Some Zod issues (e.g., invalid_type) include these extras:
        // We include them when present for clearer client-side debugging.
        expected: (i as any).expected,
        received: (i as any).received,
      }));

      return res.status(400).json({ error: "validation_failed", issues });
    }

    // Store parsed, typed data back on req.body
    // (Express Request isn't generic; casting mirrors your original approach)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).body = parsed.data;
    next();
  };
}
