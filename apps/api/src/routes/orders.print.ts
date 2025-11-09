// apps/api/src/routes/orders.print.ts
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { buildReceiptBundle } from '../services/receipt.js';
import type { ReceiptCopy } from '../services/receipt.js';
import { getPrinterFromEnv } from '../services/printer.js';
// Be flexible with whatever your auth file exports
import * as authModule from '../middlewares/auth.js';

const prisma = new PrismaClient();
const router = Router();

/** Resolve whatever the auth module exports into a RequestHandler (or a no-op). */
const authMiddleware: RequestHandler =
  // @ts-ignore - tolerate any shape from your module
  (authModule as any).authMiddleware ??
  // @ts-ignore
  (authModule as any).auth ??
  // @ts-ignore
  (authModule as any).default ??
  ((req, _res, next) => next());

/** If your Prisma model is named differently, set it here (e.g., 'orders', 'Sale', etc.). */
const MODEL_NAME = 'order' as const;

const BodySchema = z.object({
  copies: z.enum(['customer', 'kitchen', 'both']).optional().default('customer'),
  sendToPrinter: z.boolean().optional().default(false),
});

router.post('/:id/print', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = BodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { copies, sendToPrinter } = parsed.data;

    // Try numeric id; if NaN, fall back to string id
    const numericId = Number(id);
    const where =
      Number.isFinite(numericId) && !Number.isNaN(numericId)
        ? { id: numericId }
        : ({ id } as any);

    // Access model in a TS-safe-but-flexible way
    const anyPrisma = prisma as any;
    const model = anyPrisma[MODEL_NAME];
    if (!model || typeof model.findUnique !== 'function') {
      return res.status(500).json({
        error: `Prisma model '${MODEL_NAME}' not found on PrismaClient`,
        hint: `If your model is named differently, update MODEL_NAME in routes/orders.print.ts`,
      });
    }

    const order = await model.findUnique({
      where,
      include: {
        waiter: true,
        table: true,
        items: { include: { item: true, modifiers: true } },
        payments: true,
        branch: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const copyList: ReceiptCopy[] = copies === 'both' ? ['customer', 'kitchen'] : [copies];

    const printer = getPrinterFromEnv();
    const printedCopies: string[] = [];
    const htmlByCopy: Record<string, string> = {};
    const textByCopy: Record<string, string> = {};
    const escposByCopyBase64: Record<string, string> = {};

    for (const copy of copyList) {
      const bundle = buildReceiptBundle({
        order,
        options: {
          copy,
          businessName: order.branch?.displayName ?? undefined,
          branchName: order.branch?.name ?? undefined,
          addressLine: order.branch?.address ?? undefined,
          phone: order.branch?.phone ?? undefined,
          currency: 'KES',
          taxLabel: 'VAT',
          widthChars: 42,
        },
      });

      htmlByCopy[copy] = bundle.html;
      textByCopy[copy] = bundle.text;
      escposByCopyBase64[copy] = bundle.escpos.toString('base64');

      if (sendToPrinter) {
        await printer.print({ raw: bundle.escpos });
        printedCopies.push(copy);
      }
    }

    return res.json({
      printed: printedCopies.length > 0,
      printedCopies,
      copies: copyList,
      htmlByCopy,
      textByCopy,
      escposByCopyBase64,
    });
  } catch (err: any) {
    console.error('[orders.print] error', err);
    return res.status(500).json({ error: 'Failed to print receipt', details: err?.message ?? String(err) });
  }
});

export default router;
