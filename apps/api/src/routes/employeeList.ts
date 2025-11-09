import { Router, Request, Response } from "express";
import { PrismaClient, EmployeeType } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/employees?type=FIELD&active=true&q=ma&limit=50
 * - type: INSIDE | FIELD | KITCHEN (default FIELD)
 * - active: true | false (default true)
 * - q: optional search in name/phone (case-insensitive)
 * - limit: optional (default 50, max 200)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const typeParam = String(req.query.type ?? "FIELD").toUpperCase();
    const activeParam = String(req.query.active ?? "true").toLowerCase();
    const q = (req.query.q as string | undefined)?.trim();
    const limit = Math.min(
      200,
      Math.max(1, Number(req.query.limit ?? 50) || 50)
    );

    const allowedTypes = new Set<keyof typeof EmployeeType>([
      "INSIDE",
      "FIELD",
      "KITCHEN",
    ]);
    if (!allowedTypes.has(typeParam as any)) {
      return res.status(400).json({
        error: "invalid type",
        details: { allowed: Array.from(allowedTypes) },
      });
    }

    const where: any = {
      type: typeParam as EmployeeType,
      active: activeParam === "true",
    };

    if (q && q.length > 0) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ];
    }

    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        type: true,
        role: true,
        active: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
    });

    return res.json({ ok: true, employees });
  } catch (err: any) {
    console.error("employees:list error", err);
    return res
      .status(500)
      .json({ error: "internal_server_error", details: err?.message ?? String(err) });
  }
});

export default router;
