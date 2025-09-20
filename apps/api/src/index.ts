import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import compression from "compression";     // ✅ add
import responseTime from "response-time";  // ✅ add
import routes from "./routes";
import { ENV } from "./config/env";

const app = express();

app.use(helmet());
app.use(cors({ origin: ENV.CORS_ORIGINS, credentials: true }));
app.use(compression());        // ✅ gzip responses
app.use(responseTime());       // ✅ add X-Response-Time header
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", routes);

app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

const server = app.listen(ENV.PORT, "0.0.0.0", () => {
  console.log(`🚀 API running on http://localhost:${ENV.PORT}`);
});

// (simple, safe) graceful shutdown of the HTTP server
const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
