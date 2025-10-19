// Force test mode early (so server can disable morgan)
process.env.NODE_ENV = process.env.NODE_ENV || "test";

// Robustly silence just the known noisy logs during host-side tests
const origError = console.error;
console.error = (...args: any[]) => {
  const blob = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  if (
    blob.includes("POST /auth/login error: PrismaClientInitializationError") ||
    blob.includes("Can't reach database server at `db:5432`")
  ) {
    return;
  }
  origError(...args);
};

const origWarn = console.warn;
console.warn = (...args: any[]) => {
  const blob = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  if (blob.includes("Skipping field-dispatch GET test")) return;
  origWarn(...args);
};
