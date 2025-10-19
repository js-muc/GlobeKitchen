"use client";
import { JSXElementConstructor, Key, ReactElement, ReactNode, ReactPortal, useMemo, useState } from "react";
import { useDailySales } from "@/hooks/useDailySales";

export default function DailySalesView() {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const { data, isLoading, error, refetch } = useDailySales({ date, limit: 20, page: 1 });

  const rows = data?.data ?? [];
  const total = useMemo(() => rows.reduce((s: any, r: { total: any; }) => s + r.total, 0), [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <button onClick={() => refetch()} className="border rounded px-3 py-1">Refresh</button>
      </div>

      {isLoading && <div>Loading…</div>}
      {error && <div className="text-red-600">Failed to load daily sales</div>}

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left p-2">Time</th>
            <th className="text-left p-2">Item</th>
            <th className="text-right p-2">Qty</th>
            <th className="text-right p-2">Unit</th>
            <th className="text-right p-2">Total</th>
            <th className="text-left p-2">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: { id: Key | null | undefined; createdAt: string | number | Date; itemId: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; qty: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined; unitPrice: number; total: number; note: any; }) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{new Date(r.createdAt).toLocaleTimeString()}</td>
              <td className="p-2">#{r.itemId}</td>
              <td className="p-2 text-right">{r.qty}</td>
              <td className="p-2 text-right">{r.unitPrice.toFixed(2)}</td>
              <td className="p-2 text-right font-medium">{r.total.toFixed(2)}</td>
              <td className="p-2">{r.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-gray-50">
            <td className="p-2" colSpan={4}>Total</td>
            <td className="p-2 text-right font-semibold">{total.toFixed(2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
