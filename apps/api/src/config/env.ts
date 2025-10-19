export const ENV = {
  PORT: Number(process.env.PORT ?? 4000),
  JWT_SECRET: String(process.env.JWT_SECRET ?? "dev-secret"),
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "", // <- add this line
};
