import rateLimit from "express-rate-limit";

// Light defaults; tweak to your traffic profile
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 60,               // allow 60 write ops/min per IP
  standardHeaders: true, // adds RateLimit-* headers
  legacyHeaders: false,
});
