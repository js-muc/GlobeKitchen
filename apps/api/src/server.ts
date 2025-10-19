// apps/api/src/server.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import compression from "compression";
import responseTime from "response-time";
import routes from "./routes/index.js";
import { ENV } from "./config/env.js";


const app = express();

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: ENV.CORS_ORIGINS, credentials: true }));
app.use(compression());
app.use(responseTime());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", routes);

app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

export default app;
