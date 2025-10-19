// apps/api/src/routes/auth.ts
import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";
import { writeLimiter } from "../middlewares/rateLimit.js";

const prisma = new PrismaClient();
const r = Router();

/* ----------------------- helpers ----------------------- */
function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function getTokenFromReq(req: Request): string | null {
  const fromHeader = String(req.headers.authorization || "");
  if (fromHeader.toLowerCase().startsWith("bearer ")) {
    return fromHeader.slice(7).trim();
  }
  // cookie-parser must be enabled at app level
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (req as any).cookies?.token;
  return token ? String(token) : null;
}

function jwtCookieOptions() {
  const isDev = process.env.NODE_ENV === "development";
  return {
    httpOnly: true,
    secure: !isDev,
    sameSite: isDev ? ("lax" as const) : ("none" as const),
    path: "/",
    maxAge: 12 * 60 * 60 * 1000, // 12h
  };
}

/** Attempt to fetch a legacy hash from a column not in the Prisma model. */
async function fetchLegacyHash(email: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ passwordhash?: string; passwordHash?: string }[]>`
      SELECT "passwordHash"
      FROM "User"
      WHERE email = ${email}
      LIMIT 1;
    `;
    const row = rows?.[0];
    // handle possible case-folding from drivers
    return (row?.passwordHash ?? row?.passwordhash) ?? null;
  } catch {
    // Column might not exist; ignore silently
    return null;
  }
}

/** Non-fatal wrapper for the write limiter (avoids 500s if its store misbehaves) */
function safeWriteLimiter(req: Request, res: Response, next: NextFunction) {
  try {
    (writeLimiter as any)(req, res, (err?: any) => {
      if (err) {
        console.error("writeLimiter error:", err?.message || err);
        return next();
      }
      return next();
    });
  } catch (e: any) {
    console.error("writeLimiter threw:", e?.message || e);
    return next();
  }
}

/* ----------------------- routes ----------------------- */
/**
 * @openapi
 * /auth/health:
 *   get:
 *     summary: Auth service health
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Health status
 */
r.get("/health", (_req: Request, res: Response) => {
  return res.json({ ok: true, service: "auth", ts: new Date().toISOString() });
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login and obtain a JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "admin@example.com" }
 *               password: { type: string, example: "admin123" }
 *     responses:
 *       200:
 *         description: Login success
 *       400: { description: Bad request }
 *       401: { description: Invalid credentials }
 *       500: { description: Internal error or config error }
 */
r.post("/login", safeWriteLimiter, async (req: Request, res: Response) => {
  const isDev = process.env.NODE_ENV !== "production";
  const dbg = (...args: any[]) => isDev && console.log("[login]", ...args);

  try {
    if (!ENV.JWT_SECRET) {
      return res
        .status(500)
        .json({ error: "config_error", ...(isDev ? { detail: "JWT_SECRET missing" } : {}) });
    }

    const body = (req.body ?? {}) as { email?: string; password?: string };
    const email = normalizeEmail(body.email ?? "");
    const password = String(body.password ?? "");

    if (!email || !password) {
      return res.status(400).json({ error: "bad_request", message: "email and password required" });
    }

    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, email: true, password: true },
    });

    // Prefer model column `password`, fallback to legacy if any
    let stored = user?.password ?? null;
    if (!stored) {
      stored = await fetchLegacyHash(email);
    }

    if (!user || !stored || stored.length < 1) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    const looksBcrypt = stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$");

    let ok = false;
    if (looksBcrypt) {
      ok = await bcrypt.compare(password, stored);
    } else {
      ok = password === stored;
      // Opportunistic upgrade to bcrypt if plaintext matched
      if (ok) {
        try {
          const newHash = await bcrypt.hash(password, 10);
          await prisma.user.update({ where: { id: user.id }, data: { password: newHash } });
        } catch (e: any) {
          // non-fatal
          if (isDev) console.warn("password upgrade failed:", e?.message || e);
        }
      }
    }

    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const token = jwt.sign({ sub: user.id, email: user.email }, ENV.JWT_SECRET, { expiresIn: "12h" });
    return res.cookie("token", token, jwtCookieOptions()).json({ ok: true, token });
  } catch (e: any) {
    const detail = process.env.NODE_ENV === "production" ? undefined : (e?.message || String(e));
    console.error("POST /auth/login error:", detail);
    return res.status(500).json({ error: "internal_error", ...(detail ? { detail } : {}) });
  }
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Return current authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: The current user }
 *       401: { description: Missing or invalid token }
 *       404: { description: User not found }
 */
r.get("/me", async (req: Request, res: Response) => {
  try {
    if (!ENV.JWT_SECRET) {
      return res.status(500).json({ error: "config_error" });
    }

    const raw = getTokenFromReq(req);
    if (!raw) return res.status(401).json({ error: "missing_token" });

    let decoded: any;
    try {
      decoded = jwt.verify(raw, ENV.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }

    const userId = decoded?.sub ?? decoded?.id;
    if (!userId) return res.status(401).json({ error: "invalid_token" });

    // minimal selection to avoid schema drift
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { id: true, email: true },
    });

    if (!user) return res.status(404).json({ error: "user_not_found" });
    return res.json({ ok: true, user });
  } catch (e: any) {
    const detail = process.env.NODE_ENV === "production" ? undefined : (e?.message || String(e));
    console.error("GET /auth/me error:", detail);
    return res.status(500).json({ error: "internal_error", ...(detail ? { detail } : {}) });
  }
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Clear auth cookie
 *     tags: [Auth]
 *     responses:
 *       200: { description: Logout success }
 */
r.post("/logout", (req: Request, res: Response) => {
  // Clear cookie with same options so browsers actually drop it
  res.clearCookie("token", {
    ...jwtCookieOptions(),
    // clearCookie ignores maxAge; keep other attributes aligned
  });
  return res.json({ ok: true });
});

export default r;
