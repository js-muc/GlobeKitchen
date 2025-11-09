'use client';

import Link from 'next/link';

export default function FieldHubPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Field Sales</h1>
        <Link className="text-xs text-zinc-500 underline" href="/admin/payroll">← Payroll</Link>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/admin/field/dispatch" className="block rounded-2xl border p-4 bg-white/60 hover:bg-white">
          <div className="font-medium">Field Dispatch</div>
          <div className="text-sm text-zinc-600">Record items sent out to field waiters</div>
        </Link>
        <Link href="/admin/field/return" className="block rounded-2xl border p-4 bg-white/60 hover:bg-white">
          <div className="font-medium">Field Return</div>
          <div className="text-sm text-zinc-600">Capture cash collected and apply commission</div>
        </Link>
      </div>
    </div>
  );
}
