// ✅ TABLE_PRIMITIVES_FIXED — apps/web/components/ui/Table.tsx
import React, { PropsWithChildren } from "react";

/* Small helper to merge classes without adding a new dep */
function cx(...args: Array<string | undefined>) {
  return args.filter(Boolean).join(" ");
}

export function TableWrap({
  children,
  className,
  ...rest
}: PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={cx("overflow-x-auto rounded-[var(--radius-2xl)] border bg-white", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Th({
  children,
  className,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cx(
        "px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase",
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx("px-4 py-2 align-middle", className)} {...rest}>
      {children}
    </td>
  );
}

export function TrDivider({ className, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cx("border-t", className)} {...rest} />;
}

export function SkeletonRow({ cols = 7, className }: { cols?: number; className?: string }) {
  return (
    <tr className={cx("border-t animate-pulse", className)}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-24 rounded bg-gray-200/70" />
        </td>
      ))}
    </tr>
  );
}
