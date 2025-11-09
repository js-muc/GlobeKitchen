// apps/web/src/services/orders.ts
const API_BASE = (() => {
  try {
    const env = (import.meta as any)?.env;
    return (env && env.VITE_API_BASE_URL) || "/api";
  } catch { return "/api"; }
})();

function getAuthHeader(): Record<string, string> {
  try {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

export type PrintCopies = "customer" | "both";

export interface PrintReceiptResponse {
  printed: boolean;
  printedCopies: string[];
  copies: string[];
  htmlByCopy: Record<string, string>;
  textByCopy: Record<string, string>;
  escposByCopyBase64: Record<string, string>;
}

export async function printOrderReceipt(
  orderId: number | string,
  opts: { copies?: PrintCopies; sendToPrinter?: boolean } = {}
): Promise<PrintReceiptResponse> {
  if (orderId === null || orderId === undefined || orderId === "") {
    throw new Error("orderId is required");
  }
  const body = {
    copies: opts.copies ?? "customer",
    sendToPrinter: Boolean(opts.sendToPrinter),
  };

  const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(String(orderId))}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(body),
  });

  const parseJson = async () => { try { return await res.json(); } catch { return null; } };
  const data = await parseJson();

  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || `Print failed (${res.status})`);
  }

  return {
    printed: !!data?.printed,
    printedCopies: Array.isArray(data?.printedCopies) ? data.printedCopies : [],
    copies: Array.isArray(data?.copies) ? data.copies : [],
    htmlByCopy: data?.htmlByCopy && typeof data.htmlByCopy === "object" ? data.htmlByCopy : {},
    textByCopy: data?.textByCopy && typeof data.textByCopy === "object" ? data.textByCopy : {},
    escposByCopyBase64:
      data?.escposByCopyBase64 && typeof data.escposByCopyBase64 === "object" ? data.escposByCopyBase64 : {},
  };
}
