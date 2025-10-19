// apps/api/src/middlewares/error.ts
import type { Request, Response, NextFunction } from "express";

export function apiError(_: Request, res: Response, next: NextFunction) {
  return (err: any) => {
    const code = err?.code;
    if (code === "RUN_EXISTS" || code === "P2002") {
      return res.status(409).json({ error: "payroll_already_exists" });
    }
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "validation_error", detail: err.message });
    }
    console.error("API error:", err);
    return res.status(500).json({ error: "internal_error" });
  };
}
