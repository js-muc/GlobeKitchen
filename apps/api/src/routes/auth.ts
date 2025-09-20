import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";
import { writeLimiter } from "../middlewares/rateLimit";

const prisma = new PrismaClient();
const r = Router();

/**
 * POST /auth/login
 * Logs in an admin user and issues a JWT.
 */
r.post("/login", writeLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email },
    ENV.JWT_SECRET,
    { expiresIn: "12h" }
  );

  res
    .cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: process.env.NODE_ENV !== "development" ? "none" : "lax",
      path: "/",
      maxAge: 12 * 60 * 60 * 1000, // 12h
    })
    .json({ ok: true, token });
});

/**
 * POST /auth/logout
 * Clears the JWT cookie.
 */
r.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token", { path: "/" }).json({ ok: true });
});

export default r;
