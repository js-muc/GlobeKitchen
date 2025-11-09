// apps/web/src/components/PreviewCells.tsx
'use client';
import React, { useEffect, useState } from 'react';
import type { ApiClient } from '@/src/lib/apiClient';

// Light preview types used throughout the UI
export type InsidePreview = { shiftId: number | null; dailySales: number; commission: number; nextTarget: null | { target: number; earns: number } };
export type FieldPreview  = { dateISO: string; waiterId: number; cashCollected: number; commission: number; nextTarget: null | { target: number; earns: number } };

function money(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString(undefined, { style: 'currency', currency: 'KES', maximumFractionDigits: 2 });
}

/**
 * InsideCell — small, fast preview used in the Admin Dashboard rows
 */
export function InsideCell({ id, api, tick }: { id: number; api: ApiClient; tick: number }) {
  const [data, setData] = useState<InsidePreview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await api.get<InsidePreview>(`/commission/inside/today/${id}`);
        if (!cancel) { setData(r); setErr(null); }
      } catch (e: any) { if (!cancel) setErr(e?.message || 'Failed'); }
    })();
    return () => { cancel = true; };
  }, [id, api, tick]);

  if (err) return <span className="text-xs text-red-600">•</span>;
  if (!data) return <span className="text-xs text-zinc-400">…</span>;
  const hint = data.nextTarget ? `Next: ${money(data.nextTarget.target)} → earn ${money(data.nextTarget.earns)}` : "—";
  return (
    <div className="text-sm">
      <div>{money(data.commission)}</div>
      <div className="text-xs text-zinc-500">Sales: {money(data.dailySales)} • {hint}</div>
    </div>
  );
}

/**
 * FieldCell — small preview for field cash
 */
export function FieldCell({ id, api, tick }: { id: number; api: ApiClient; tick: number }) {
  const [data, setData] = useState<FieldPreview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await api.get<FieldPreview>(`/commission/field/today/${id}`);
        if (!cancel) { setData(r); setErr(null); }
      } catch (e: any) { if (!cancel) setErr(e?.message || 'Failed'); }
    })();
    return () => { cancel = true; };
  }, [id, api, tick]);

  if (err) return <span className="text-xs text-red-600">•</span>;
  if (!data) return <span className="text-xs text-zinc-400">…</span>;
  const hint = data.nextTarget ? `Next: ${money(data.nextTarget.target)} → earn ${money(data.nextTarget.earns)}` : "—";
  return (
    <div className="text-sm">
      <div>{money(data.commission)}</div>
      <div className="text-xs text-zinc-500">Cash: {money(data.cashCollected)} • {hint}</div>
    </div>
  );
}
