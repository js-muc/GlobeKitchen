// apps/api/src/services/receipt.ts

// ❗ No Prisma type imports here — we stay schema-agnostic

export type ReceiptCopy = 'customer' | 'kitchen';
export type ReceiptBuildOptions = {
  copy: ReceiptCopy;                 // which copy to generate
  businessName?: string;             // header name override
  branchName?: string | null;
  addressLine?: string | null;
  phone?: string | null;
  taxLabel?: string;                 // e.g., "VAT"
  currency?: string;                 // e.g., "KES"
  widthChars?: number;               // for text wrap, e.g. 42 for 58mm paper
};

export type BuiltReceipt = {
  html: string;
  text: string;
  escpos: Buffer; // raw ESC/POS bytes (you can base64 it for transport)
};

/** Minimal structural type for what we actually read on a receipt. */
export type ReceiptOrder = {
  id: number | string;
  orderNumber?: number | string | null;

  createdAt: string | number | Date;
  closedAt?: string | number | Date | null;

  subtotal?: number | null;
  taxTotal?: number | null;
  discountTotal?: number | null;
  serviceChargeTotal?: number | null;
  total?: number | null;

  waiter?: { name?: string | null } | null;
  table?: { name?: string | null } | null;

  items: Array<{
    name?: string | null;               // fallback name field
    quantity: number;
    unitPrice?: number | null;
    total?: number | null;
    item?: { name?: string | null } | null;
    modifiers?: Array<{ name?: string | null }> | null;
  }>;

  payments?: Array<{
    method?: string | null;
    reference?: string | null;
  }> | null;

  branch?: {
    displayName?: string | null;
    name?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
};

const pad = (s: string, len: number) => (s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length));
const padLeft = (s: string, len: number) => (s.length >= len ? s.slice(-len) : ' '.repeat(len - s.length) + s);

function wrapLine(line: string, width: number): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    parts.push(line.slice(i, i + width));
    i += width;
  }
  return parts.length ? parts : [''];
}

function fmtMoney(n: number, currency: string) {
  // Avoid Intl for maximum portability; keep consistent with KES
  return `${currency} ${n.toFixed(2)}`;
}

export function buildReceiptHTML(params: {
  order: ReceiptOrder;
  options: ReceiptBuildOptions;
}): string {
  const { order, options } = params;
  const {
    businessName = order.branch?.displayName ?? 'GlobeKitchen',
    branchName = order.branch?.name ?? null,
    addressLine = order.branch?.address ?? null,
    phone = order.branch?.phone ?? null,
    taxLabel = 'VAT',
    currency = 'KES',
  } = options;

  const createdAt = new Date(order.createdAt);
  const paidAt = order.closedAt ? new Date(order.closedAt) : null;

  const lines = (order.items ?? []).map((oi) => {
    const name = oi.item?.name ?? oi.name ?? 'Item';
    const qty = oi.quantity ?? 0;
    const unit = oi.unitPrice ?? 0;
    const total = oi.total ?? qty * unit;
    return { name, qty, unit, total, modifiers: oi.modifiers ?? [] };
  });

  const subtotal = order.subtotal ?? lines.reduce((a, b) => a + (b.total ?? 0), 0);
  const tax = order.taxTotal ?? 0;
  const discount = order.discountTotal ?? 0;
  const service = order.serviceChargeTotal ?? 0;
  const grand = order.total ?? (subtotal + tax + service - discount);

  const paymentMethods = (order.payments ?? []).map(p => `${p.method ?? '—'}${p.reference ? ' (' + p.reference + ')' : ''}`);

  // Simple inline styles to print nicely
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Receipt #${order.orderNumber ?? order.id}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; margin:0; padding:16px; font-size:12px; color:#111}
  .center{text-align:center}
  .bold{font-weight:700}
  .muted{color:#555}
  hr{border:none; border-top:1px dashed #999; margin:8px 0}
  table{width:100%; border-collapse:collapse}
  td{vertical-align:top; padding:2px 0}
  .right{text-align:right}
  .small{font-size:11px}
  .big{font-size:14px}
  .totals td{padding:2px 0}
  .totals .label{color:#333}
  .totals .value{text-align:right}
</style>
</head>
<body>
  <div class="center bold big">${businessName}</div>
  ${branchName ? `<div class="center">${branchName}</div>` : ''}
  ${addressLine ? `<div class="center small">${addressLine}</div>` : ''}
  ${phone ? `<div class="center small">Tel: ${phone}</div>` : ''}
  <hr/>
  <div class="small">
    <div><span class="bold">Receipt:</span> #${order.orderNumber ?? order.id}</div>
    <div><span class="bold">Copy:</span> ${options.copy.toUpperCase()}</div>
    <div><span class="bold">Date:</span> ${createdAt.toLocaleString()}</div>
    ${paidAt ? `<div><span class="bold">Paid At:</span> ${paidAt.toLocaleString()}</div>` : ''}
    <div><span class="bold">Waiter:</span> ${order.waiter?.name ?? '—'}</div>
    <div><span class="bold">Table:</span> ${order.table?.name ?? '—'}</div>
  </div>
  <hr/>
  <table>
    <tbody>
      ${lines.map(l => `
        <tr>
          <td>${l.qty} × ${l.name}</td>
          <td class="right">${fmtMoney(l.unit, currency)}</td>
        </tr>
        ${l.modifiers?.length ? `<tr><td class="muted small">  • ${l.modifiers.map((m:any)=>m.name).join(', ')}</td><td></td></tr>`:''}
        <tr>
          <td></td>
          <td class="right bold">${fmtMoney(l.total ?? 0, currency)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <hr/>
  <table class="totals">
    <tbody>
      <tr><td class="label">Subtotal</td><td class="value">${fmtMoney(subtotal, currency)}</td></tr>
      ${discount ? `<tr><td class="label">Discount</td><td class="value">- ${fmtMoney(discount, currency)}</td></tr>`:''}
      ${service ? `<tr><td class="label">Service</td><td class="value">${fmtMoney(service, currency)}</td></tr>`:''}
      ${tax ? `<tr><td class="label">${taxLabel}</td><td class="value">${fmtMoney(tax, currency)}</td></tr>`:''}
      <tr><td class="label bold">Total</td><td class="value bold">${fmtMoney(grand, currency)}</td></tr>
    </tbody>
  </table>
  <hr/>
  ${paymentMethods.length ? `<div class="small"><span class="bold">Payment:</span> ${paymentMethods.join(', ')}</div>` : ''}
  <div class="center small muted" style="margin-top:8px">Thank you and welcome again!</div>
</body>
</html>`;
}

export function buildReceiptText(params: {
  order: ReceiptOrder;
  options: ReceiptBuildOptions;
}): string {
  const { order, options } = params;
  const width = options.widthChars ?? 42; // good default for 58mm paper
  const currency = options.currency ?? 'KES';
  const business = options.businessName ?? order.branch?.displayName ?? 'GlobeKitchen';
  const header = `${business}\n${order.branch?.name ?? ''}\n`;

  const createdAt = new Date(order.createdAt).toLocaleString();
  const meta = [
    `Receipt: #${order.orderNumber ?? order.id}`,
    `Copy: ${options.copy.toUpperCase()}`,
    `Date: ${createdAt}`,
    `Waiter: ${order.waiter?.name ?? '—'}`,
    `Table: ${order.table?.name ?? '—'}`,
  ].join('\n');

  const sep = '-'.repeat(width);

  let lines: string[] = [];
  for (const oi of order.items ?? []) {
    const name = oi.item?.name ?? oi.name ?? 'Item';
    const qty = oi.quantity ?? 0;
    const unit = oi.unitPrice ?? 0;
    const total = oi.total ?? qty * unit;
    const left = `${qty} x ${name}`;
    const right = fmtMoney(total, currency);
    const space = width - left.length - right.length;
    const row = space >= 1 ? `${left}${' '.repeat(space)}${right}` : left;
    lines.push(...wrapLine(row, width));
    if (oi.modifiers?.length) {
      lines.push(...wrapLine(`  • ${oi.modifiers.map(m => m.name).join(', ')}`, width));
    }
  }

  const subtotal = order.subtotal ?? (order.items ?? []).reduce((a, oi) => a + (oi.total ?? (oi.quantity * (oi.unitPrice ?? 0))), 0);
  const tax = order.taxTotal ?? 0;
  const discount = order.discountTotal ?? 0;
  const service = order.serviceChargeTotal ?? 0;
  const grand = order.total ?? (subtotal + tax + service - discount);

  const totals = [
    { k: 'Subtotal', v: fmtMoney(subtotal, currency) },
    ...(discount ? [{ k: 'Discount', v: `- ${fmtMoney(discount, currency)}` }] : []),
    ...(service ? [{ k: 'Service', v: fmtMoney(service, currency) }] : []),
    ...(tax ? [{ k: options.taxLabel ?? 'VAT', v: fmtMoney(tax, currency) }] : []),
    { k: 'TOTAL', v: fmtMoney(grand, currency) },
  ].map(({ k, v }) => {
    const left = k;
    const right = v;
    const space = width - left.length - right.length;
    return space >= 1 ? `${left}${' '.repeat(space)}${right}` : `${left}\n${padLeft(right, width)}`;
  });

  const payments = (order.payments ?? []).map(p => `${p.method ?? '—'}${p.reference ? ' ('+p.reference+')' : ''}`).join(', ');

  const footer = [
    payments ? `Payment: ${payments}` : null,
    'Thank you and welcome again!',
  ].filter(Boolean).join('\n');

  return [
    ...wrapLine(header.trim(), width),
    sep,
    ...wrapLine(meta, width),
    sep,
    ...lines,
    sep,
    ...totals,
    sep,
    ...wrapLine(footer, width),
  ].join('\n');
}

// Minimal ESC/POS generator: initialize + text + cut
export function buildReceiptEscpos(text: string): Buffer {
  const esc = (s: number[]) => Buffer.from(s);
  const init = esc([0x1B, 0x40]);          // Initialize
  const alignLeft = esc([0x1B, 0x61, 0x00]);
  const textBuf = Buffer.from(text.replace(/\n/g, '\r\n'), 'utf8');
  const feed = esc([0x1B, 0x64, 0x05]);    // feed 5 lines
  const cut = esc([0x1D, 0x56, 0x41, 0x10]); // partial cut
  return Buffer.concat([init, alignLeft, textBuf, feed, cut]);
}

export function buildReceiptBundle(args: { order: ReceiptOrder; options: ReceiptBuildOptions }): BuiltReceipt {
  const text = buildReceiptText(args);
  const escpos = buildReceiptEscpos(text);
  const html = buildReceiptHTML(args);
  return { html, text, escpos };
}
