// apps/api/src/middlewares/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";

/** JWT payload we expect */
export interface AdminClaims {
  sub: number;            // coerced to number in verifyToken()
  email: string;
  iat?: number;
  exp?: number;

  // Optional fields to future-proof admin checks
  role?: string;          // e.g. "ADMIN"
  isAdmin?: boolean;      // e.g. true
}

/** Express typing: attach decoded user/admin to the request */
export interface RequestWithAdmin extends Request {
  user?: AdminClaims;     // always present after requireAuth
  admin?: AdminClaims;    // kept for backward compatibility
}

const TOKEN_COOKIE = "token";

/** ---------- BYPASS helpers (LOCAL TEST ONLY) ---------- */
function isBypassEnabled(): boolean {
  // Prefer ENV.BYPASS_AUTH if your config exposes it; fall back to process.env
  const v = (ENV as any).BYPASS_AUTH ?? process.env.BYPASS_AUTH;
  return String(v) === "1";
}

/** A safe, minimal fake admin to attach during bypass */
function fakeAdmin(): AdminClaims {
  const email =
    ENV.ADMIN_EMAIL ??
    "bypass-admin@example.local";
  return {
    sub: 0,
    email,
    role: "ADMIN",
    isAdmin: true,
  };
}

function attachUser(req: RequestWithAdmin, res: Response, claims: AdminClaims) {
  req.user = claims;
  req.admin = claims; // back-compat
  (res.locals as any).user = claims;
  (res.locals as any).admin = claims;
}

/** ---------- token helpers (unchanged) ---------- */
/** Safely extract a bearer token from an Authorization header */
function extractBearerToken(headerValue?: string): string | null {
  if (!headerValue) return null;
  const parts = headerValue.split(" ");
  // Case-insensitive "Bearer"
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
    return parts[1]?.trim() || null;
  }
  // Some clients send the raw token without "Bearer "
  if (parts.length === 1 && headerValue.length > 20) return headerValue.trim();
  return null;
}

/** Get JWT from header or cookie */
function getTokenFromRequest(req: Request): string | null {
  // 1) Authorization: Bearer <token>
  const headerToken = extractBearerToken(req.headers.authorization);
  if (headerToken) return headerToken;

  // 2) Cookie: token=<token>
  // NOTE: ensure app uses cookie-parser middleware earlier in the chain.
  const cookieToken = (req as any).cookies?.[TOKEN_COOKIE];
  if (cookieToken && typeof cookieToken === "string" && cookieToken.length > 20) {
    return cookieToken;
  }

  // 3) (Optional) x-access-token header used by some clients
  const altHeader = req.headers["x-access-token"];
  if (typeof altHeader === "string" && altHeader.length > 20) return altHeader;

  return null;
}

/** Centralized JWT verify that returns typed claims or throws */
function verifyToken(token: string): AdminClaims {
  if (!ENV.JWT_SECRET) {
    // Fail fast with a clear error rather than opaque 500s later.
    throw new jwt.JsonWebTokenError("JWT_SECRET missing on server");
  }

  const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;

  // Minimal sanity checks + coercions
  const rawSub = decoded?.sub;
  const subNum =
    typeof rawSub === "number"
      ? rawSub
      : typeof rawSub === "string" && /^\d+$/.test(rawSub)
      ? Number(rawSub)
      : NaN;

  if (!decoded || !Number.isFinite(subNum) || !decoded.email) {
    throw new jwt.JsonWebTokenError("Invalid JWT payload");
  }

  const claims: AdminClaims = {
    sub: subNum,
    email: String(decoded.email),
    iat: typeof decoded.iat === "number" ? decoded.iat : undefined,
    exp: typeof decoded.exp === "number" ? decoded.exp : undefined,
    role: typeof decoded.role === "string" ? decoded.role : undefined,
    isAdmin: decoded.isAdmin === true ? true : undefined,
  };

  return claims;
}

/** Decide if a decoded JWT confers admin privileges */
function isAdminUser(claims: AdminClaims): boolean {
  const viaRole = claims.role?.toUpperCase() === "ADMIN" || claims.isAdmin === true;
  const viaEnvEmail =
    ENV.ADMIN_EMAIL &&
    typeof claims.email === "string" &&
    claims.email.toLowerCase() === ENV.ADMIN_EMAIL.toLowerCase();

  return Boolean(viaRole || viaEnvEmail);
}

/**
 * requireAuth
 * - Verifies JWT (header or cookie)
 * - Attaches claims to req.user and req.admin (back-compat)
 * - BYPASS: if BYPASS_AUTH=1, auto-attach a fake admin
 */
export function requireAuth(req: RequestWithAdmin, res: Response, next: NextFunction) {
  try {
    if (isBypassEnabled()) {
      attachUser(req, res, fakeAdmin());
      return next();
    }

    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: "unauthorized" });

    const claims = verifyToken(token);

    // Attach for downstream use
    attachUser(req, res, claims);

    return next();
  } catch (err: any) {
    // Standardized, non-leaky errors
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "token_expired" });
    }
    if (err?.name === "JsonWebTokenError" || err?.name === "NotBeforeError") {
      return res.status(401).json({ error: "invalid_token" });
    }
    return res.status(401).json({ error: "unauthorized" });
  }
}

/**
 * requireAdmin
 * - Requires a valid auth (use after requireAuth) and admin privilege.
 * - Admin if:
 *    • JWT has role "ADMIN" OR isAdmin === true
 *    • OR email matches ENV.ADMIN_EMAIL
 * - BYPASS: if BYPASS_AUTH=1, auto-attach a fake admin
 */
export function requireAdmin(req: RequestWithAdmin, res: Response, next: NextFunction) {
  try {
    if (isBypassEnabled()) {
      attachUser(req, res, fakeAdmin());
      return next();
    }

    // If a previous middleware didn't load the user, do it now for convenience
    if (!req.user) {
      const token = getTokenFromRequest(req);
      if (!token) return res.status(401).json({ error: "unauthorized" });
      const claims = verifyToken(token);
      attachUser(req, res, claims);
    }

    if (!req.user) return res.status(401).json({ error: "unauthorized" });
    if (!isAdminUser(req.user)) return res.status(403).json({ error: "forbidden_admin_required" });

    return next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "token_expired" });
    }
    if (err?.name === "JsonWebTokenError" || err?.name === "NotBeforeError") {
      return res.status(401).json({ error: "invalid_token" });
    }
    return res.status(401).json({ error: "unauthorized" });
  }
}
