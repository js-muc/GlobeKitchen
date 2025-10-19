// apps/api/src/middlewares/rateLimit.ts
import rateLimit from "express-rate-limit";

/**
 * NOTE:
 * If you’re behind a proxy/load balancer (nginx, Heroku, etc.),
 * set this in your Express app:
 *   app.set("trust proxy", 1);
 */

function ipv6SafeIpKey(req: any): string {
  // Prefer library helpers if present (handles IPv6 correctly)
  const ipKeyGen =
    // named export on some builds
    (rateLimit as any).ipKeyGenerator ||
    // internal helper exposed in others
    (rateLimit as any).keyGeneratorIpFallback;

  if (typeof ipKeyGen === "function") {
    // Cast to any to satisfy mismatched TS types across versions
    return String(ipKeyGen(req));
  }

  // Fallback: normalize common IPv6-mapped IPv4 form ::ffff:x.y.z.w
  const raw =
    req?.ip ||
    req?.socket?.remoteAddress ||
    req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    "unknown";
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

/**
 * Write limiter:
 * - 60 write ops/minute
 * - Keys by authenticated user id when available
 * - Falls back to IPv6-safe IP key
 * - JSON error body
 */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req: any) => {
    const uid = req?.user?.sub ?? req?.admin?.sub;
    if (typeof uid === "number" && Number.isFinite(uid)) return `u:${uid}`;
    return `ip:${ipv6SafeIpKey(req)}`;
  },

  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  message: { error: "rate_limited", retryAfterSec: 60 },
});
