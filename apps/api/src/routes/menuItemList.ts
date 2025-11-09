import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/menu-items?active=true&q=cha&limit=50
 * - active: true | false (default true)
 * - q: optional search by name/category (case-insensitive)
 * - limit: optional (default 50, max 200)
 *
 * Returns minimal fields needed for field dispatch UI.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const activeParam = String(req.query.active ?? "true").toLowerCase();
    const q = (req.query.q as string | undefined)?.trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));

    const where: any = {
      active: activeParam === "true",
    };

    if (q && q.length > 0) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ];
    }

    const items = await prisma.menuItem.findMany({
      where,
      select: {
        id: true,
        name: true,
        category: true,
        unit: true,
        priceSell: true,   // use this as default priceEach in dispatch UI
        active: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
    });

    return res.json({ ok: true, items });
  } catch (err: any) {
    console.error("menu-items:list error", err);
    return res
      .status(500)
      .json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
