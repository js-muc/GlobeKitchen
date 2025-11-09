// apps/api/src/index.ts
import express from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";

// Routers
import routes from "./routes/index.js";
import dailySalesRouter from "./routes/dailySales.js";
import shiftsRouter from "./routes/shifts.js";

// Swagger/OpenAPI
import * as swaggerUi from "swagger-ui-express";
import { openapiSpec } from "./docs/openapi.js";

// Config
import { ENV } from "./config/env.js";

const app = express();

/* =========================
   Core & Security Middlewares
========================= */
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: false,
  })
);
app.disable("x-powered-by");

/* =========================
   CORS
========================= */
const DEV_DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const allowlist = Array.from(
  new Set([...(ENV.CORS_ORIGINS || []), ...DEV_DEFAULT_ORIGINS])
);

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowlist.includes(origin)) return cb(null, true);
    console.warn(
      `[CORS] blocked origin: ${origin} (allowed: ${allowlist.join(", ")})`
    );
    return cb(new Error("CORS: origin not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "Accept",
    "Content-Type",
    "Authorization",
    "X-Requested-With",
  ],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
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

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

/* =========================
   Daily Sales namespace
========================= */
app.use("/api/daily-sales", dailySalesRouter);
// Alias for older clients
app.use("/api/daily-sales/shifts", shiftsRouter);

/* =========================
   OpenAPI (raw + UI)
========================= */
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
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
    if (err?.message && /CORS: origin not allowed/i.test(err.message)) {
      return res.status(403).json({
        error: "cors_blocked_origin",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : `Origin not allowed by server CORS. Allowed: ${allowlist.join(
                ", "
              )}`,
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

export default app;
