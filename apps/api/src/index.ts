// apps/api/src/index.ts
import express from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import routes from "./routes/index.js";
import dailySalesRouter from "./routes/dailySales.js";
// NEW: direct shifts router alias under /api/daily-sales
import shiftsRouter from "./routes/shifts.js";

// ✅ Swagger/OpenAPI — use namespace import for wide compat
import * as swaggerUi from "swagger-ui-express";
import { openapiSpec } from "./docs/openapi.js";

// Config (CORS allow-list, port, etc.)
import { ENV } from "./config/env.js";

// Optional: load env (uncomment if you prefer .env autoload here)
// import "dotenv/config";

const app = express();

/* =========================
   Core & Security Middlewares
========================= */

// behind a proxy/load balancer (X-Forwarded-For, secure cookies)
app.set("trust proxy", 1);

// Helmet (allow Swagger UI inline assets in dev)
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
  })
);
// be explicit
app.disable("x-powered-by");

/* =========================
   CORS
   - Uses ENV.CORS_ORIGINS
   - Adds dev-safe defaults for Next.js on :3000
   - Credentials enabled (cookies/Authorization)
========================= */
const DEV_DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

// Merge + de-dupe ENV allow-list with dev defaults
const allowlist = Array.from(
  new Set([...(ENV.CORS_ORIGINS || []), ...DEV_DEFAULT_ORIGINS])
);

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, cb) {
    // No Origin header (curl, same-origin) => allow
    if (!origin) return cb(null, true);
    if (allowlist.includes(origin)) return cb(null, true);
    // Helpful log during setup
    console.warn(`[CORS] blocked origin: ${origin} (allowed: ${allowlist.join(", ")})`);
    return cb(new Error("CORS: origin not allowed"));
  },
  // Make preflight explicit and compatible with axios/fetch defaults
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "Accept",
    "Content-Type",
    "Authorization",
    "X-Requested-With",
  ],
  optionsSuccessStatus: 204, // old browsers/edge-cases
};

app.use(cors(corsOptions));
// Handle preflight explicitly for non-simple requests
app.options("*", cors(corsOptions));

/* =========================
   Logging
========================= */
app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms", {
    skip: (req) => req.url === "/health" || req.url === "/api/health",
  })
);

/* =========================
   Body & Cookies
========================= */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(compression());

/* =========================
   Health
========================= */
const healthHandler: express.RequestHandler = (_req, res) =>
  res.json({ ok: true, service: "api", ts: new Date().toISOString() });

// Original path
app.get("/health", healthHandler);
// Alias to match existing scripts/tests
app.get("/api/health", healthHandler);

/* =========================
   Daily Sales (namespace)
========================= */
// Existing daily-sales router (unchanged)
app.use("/api/daily-sales", dailySalesRouter);

// NEW: shifts alias under daily-sales namespace
// Note: /api/shifts is also mounted via `routes` below; this alias preserves older clients.
app.use("/api/daily-sales/shifts", shiftsRouter);

/* =========================
   OpenAPI (raw + UI)
========================= */
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
// Alias to satisfy /api/docs-json callers
app.get("/api/docs-json", (_req, res) => res.json(openapiSpec));

app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, {
    explorer: true,
    customSiteTitle: "GlobeKitchen API Docs",
  })
);

/* =========================
   Application routes
========================= */
// This mounts everything from apps/api/src/routes/index.ts,
// including /api/shifts after your previous update.
app.use("/api", routes);

/* =========================
   404 fallback
========================= */
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.url });
});

/* =========================
   Error Handling
========================= */
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
      return res
        .status(400)
        .json({ error: "invalid_json", detail: err.message ?? "Bad JSON" });
    }
    // If a CORS origin was blocked, surface that clearly in dev
    if (err?.message && /CORS: origin not allowed/i.test(err.message)) {
      return res.status(403).json({
        error: "cors_blocked_origin",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : `Origin not allowed by server CORS. Allowed: ${allowlist.join(", ")}`,
      });
    }
    return res.status(500).json({
      error: "internal_error",
      detail:
        process.env.NODE_ENV === "production"
          ? undefined
          : err?.message || String(err),
    });
  }
);

/* =========================
   Startup
========================= */
const PORT = Number(process.env.PORT || 4000);

// Export the app for tests/integration runners
export default app;

// Start listening only when run directly (not when imported by tests)
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 API running on http://localhost:${PORT}`);
    console.log(`📘 OpenAPI docs at http://localhost:${PORT}/api/docs`);
    console.log(`[CORS] allowed origins: ${allowlist.join(", ") || "(any)"}`);
  });

  // Friendlier EADDRINUSE message
  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${PORT} is already in use. Stop the other process or set PORT to a free port.`
      );
    } else {
      console.error("❌ Server error:", err?.message || err);
    }
    process.exit(1);
  });
}
