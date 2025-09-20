import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const bearer = req.headers.authorization?.split(" ")[1];
    const token = bearer || (req as any).cookies?.token;
    if (!token) return res.status(401).json({ error: "unauthorized" });

    const decoded = jwt.verify(token, ENV.JWT_SECRET) as unknown as { sub: number; email: string };
    (req as any).admin = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}
