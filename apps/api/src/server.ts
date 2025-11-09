// apps/api/src/server.ts
// Entry point that boots the Express server safely in NodeNext mode.

import type { Express } from "express";
// Namespace import to be safe under NodeNext
import * as indexMod from "./index.js";

// Use default export if available, otherwise fallback to module object
const app: Express = (indexMod as any).default ?? (indexMod as any);

const PORT = Number(process.env.PORT || 4000);

// Start server (guard tests)
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🚀 API running on http://localhost:${PORT}`);
    console.log(`📘 OpenAPI docs at http://localhost:${PORT}/api/docs`);
  });
}

export default app;
