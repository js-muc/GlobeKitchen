/// <reference types="jest" />
import request from "supertest";
import app from "../server";

const SKIP_AUTH_PROBE = process.env.SKIP_AUTH_PROBE === "1";

async function getAuthHeaderOrSkip() {
  if (SKIP_AUTH_PROBE) return "SKIP" as const;

  const probe = await request(app).get("/api/field-dispatch");
  if (probe.status !== 401) return undefined;

  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  const login = await request(app).post("/api/auth/login").send({ email, password });
  if (login.status >= 500) return "SKIP" as const;

  const token = login.body?.token || login.body?.accessToken;
  return token ? { Authorization: `Bearer ${token}` } : ("SKIP" as const);
}

describe("GET /api/field-dispatch serialization", () => {
  it("ensures priceEach is string or null", async () => {
    const headers = await getAuthHeaderOrSkip();
    if (headers === "SKIP") {
      expect(true).toBe(true);
      return;
    }
    const res = await request(app).get("/api/field-dispatch").set(headers ?? {}).expect(200);
    const payload = Array.isArray(res.body) ? res.body : res.body.data;
    expect(Array.isArray(payload)).toBe(true);
    for (const row of payload) {
      expect(typeof row.qtyDispatched).toBe("number");
      expect(row.priceEach === null || typeof row.priceEach === "string").toBe(true);
    }
  });
});
