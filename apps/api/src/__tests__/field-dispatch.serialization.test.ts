/// <reference types="jest" />
import { serializeDispatch } from "../routes/fieldDispatch";

describe("fieldDispatch serializeDispatch money normalization", () => {
  it("coerces priceEach to string or null across types", () => {
    const base = {
      id: 1,
      date: new Date("2025-01-01T00:00:00Z"),
      waiterId: 10,
      itemId: 5,
      qtyDispatched: 3,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    };

    const cases: Array<{ priceEach: any; expect: string | null }> = [
      { priceEach: null, expect: null },
      { priceEach: undefined, expect: null },
      { priceEach: 250, expect: "250" },
      { priceEach: 250.5, expect: "250.5" },
      { priceEach: "300", expect: "300" },
      { priceEach: { toString: () => "199.99" } as any, expect: "199.99" },
    ];

    for (const c of cases) {
      const out = serializeDispatch({ ...base, priceEach: c.priceEach } as any);
      expect(typeof out.qtyDispatched).toBe("number");

      if (c.expect === null) {
        expect(out.priceEach).toBeNull();
      } else {
        expect(out.priceEach).toBe(c.expect);
        expect(typeof out.priceEach).toBe("string");
      }
    }
  });
});
