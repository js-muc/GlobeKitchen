// apps/web/src/components/AdminNav.tsx
'use client';
import React from 'react';
import { API_BASE } from '@/src/lib/apiClient';

export default function AdminNav() {
  return (
    <nav className="sticky top-0 z-10 mb-6 bg-white/70 backdrop-blur border rounded-2xl p-2 flex flex-wrap items-center gap-2">
      <a href="/admin" className="px-3 py-1.5 rounded-lg border">Dashboard</a>
      <a href="/admin/employees" className="px-3 py-1.5 rounded-lg border">Employees</a>
      <a href="/admin/menu" className="px-3 py-1.5 rounded-lg border">Menu Items</a>
      <a href="/admin/payroll" className="px-3 py-1.5 rounded-lg border">Payroll</a>
      <a href="/admin/field/dispatch" className="px-3 py-1.5 rounded-lg border">Field Dispatch</a>
      <a href="/admin/field/return" className="px-3 py-1.5 rounded-lg border">Field Return</a>
      <a href={`${API_BASE.replace(/\/api$/, '')}/docs`} target="_blank" rel="noreferrer" className="ml-auto px-3 py-1.5 rounded-lg border">Open API Docs</a>
    </nav>
  );
}
