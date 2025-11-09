// apps/web/src/pages/PrintReceiptTool.tsx
import { useState } from "react";
import { printOrderReceipt } from "../services/orders";
import { openHtmlAndPrint } from "../utils/print";

export default function PrintReceiptTool() {
  const [orderId, setOrderId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    const id = orderId.trim();
    if (!id) { setErr("Enter an Order ID"); return; }
    setLoading(true);
    try {
      const data = await printOrderReceipt(id, { copies: "customer", sendToPrinter: false });
      const html = data.htmlByCopy.customer ?? Object.values(data.htmlByCopy)[0];
      if (!html) throw new Error("Server did not return receipt HTML.");

      openHtmlAndPrint(html, `Receipt #${id}`);
      setMsg(`Opened print dialog for order ${id}`);
    } catch (e: any) {
      setErr(e?.message || "Failed to print");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold mb-3">Print Receipt (Quick Tool)</h1>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className="flex-1 border rounded-lg px-3 py-2"
          placeholder="Order ID (e.g., 123)"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
        <button
          className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
          disabled={loading}
          type="submit"
        >
          {loading ? "Printing…" : "Print"}
        </button>
      </form>
      {msg && <div className="mt-3 text-green-700">{msg}</div>}
      {err && <div className="mt-3 text-red-700">{err}</div>}

      <p className="mt-6 text-sm text-neutral-600">
        Tip: Ensure the backend is running at <code>/api</code> or set <code>VITE_API_BASE_URL</code>.
      </p>
    </div>
  );
}
