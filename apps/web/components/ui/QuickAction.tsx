"use client";

import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

export type QAIntent =
  | "employees"
  | "sales"
  | "stock"
  | "menu"
  | "field"
  | "payroll"
  | "neutral"
  | "success"
  | "warning";

type Props = {
  /** Optional. When present, QuickAction renders as a link; otherwise as a plain card */
  href?: string;
  title: string;
  desc: string;
  icon: ReactNode;
  intent?: QAIntent;
  emphasis?: boolean;
  className?: string;
};

/** Presentational quick-action card; safe to nest inside external <Link> when href is omitted */
export function QuickAction({
  href,
  title,
  desc,
  icon,
  intent = "neutral",
  emphasis = false,
  className,
}: Props) {
  const color =
    {
      employees: "text-blue-700",
      sales: "text-emerald-700",
      stock: "text-amber-700",
      menu: "text-pink-700",
      field: "text-indigo-700",
      payroll: "text-teal-700",
      neutral: "text-slate-700",
      success: "text-emerald-700",
      warning: "text-amber-700",
    }[intent] ?? "text-slate-700";

  const Card = (
    <div
      className={clsx(
        // responsive-friendly card container
        "rounded-[var(--radius-2xl)] border bg-white p-5 transition will-change-transform",
        "sm:p-5 p-4",
        emphasis && "ring-1 ring-brand shadow",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
            color
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-medium truncate">{title}</h3>
          <p className="mt-0.5 text-sm text-gray-600 line-clamp-2">{desc}</p>
        </div>
      </div>
    </div>
  );

  // If href is provided, render as a single <Link> wrapper (no nested <a> issues)
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {Card}
      </Link>
    );
  }

  // Otherwise just return the card so it can be wrapped by a parent Link safely
  return Card;
}

export default QuickAction;
