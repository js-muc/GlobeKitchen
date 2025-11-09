import React, { useMemo, useState } from "react";
import { printOrderReceipt, type PrintCopies } from "../services/orders";
import { openHtmlAndPrint } from "../utils/print";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export interface PrintReceiptButtonProps {
  orderId: number | string;

  /** We only support 'customer' or 'both' per your decision (prices included). */
  copies?: PrintCopies; // default: 'customer'

  /** If true and printer is configured on backend, it will also send ESC/POS. */
  sendToPrinter?: boolean; // default: false

  /** Disable the button (e.g., when no order is selected). */
  disabled?: boolean;

  /** Optional UI props */
  variant?: ButtonVariant; // default: 'primary'
  size?: ButtonSize;       // default: 'md'
  className?: string;

  /** Callbacks */
  onPrinted?: (args: {
    orderId: number | string;
    printed: boolean;
    copies: string[];
  }) => void;
  onError?: (message: string) => void;

  /** Custom button content; default label provided if omitted */
  children?: React.ReactNode;
}

export function PrintReceiptButton({
  orderId,
  copies = "customer",
  sendToPrinter = false,
  disabled = false,
  variant = "primary",
  size = "md",
  className,
  onPrinted,
  onError,
  children,
}: PrintReceiptButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const btnClasses = useMemo(() => {
    const base =
      "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
    const byVariant: Record<ButtonVariant, string> = {
      primary:
        "bg-black text-white hover:bg-black/85 focus:ring-black dark:bg-white dark:text-black dark:hover:bg-white/90 dark:focus:ring-white",
      secondary:
        "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 focus:ring-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 dark:focus:ring-neutral-600",
      ghost:
        "bg-transparent text-neutral-900 hover:bg-neutral-100 focus:ring-neutral-300 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus:ring-neutral-600",
    };
    const bySize: Record<ButtonSize, string> = {
      sm: "h-9 px-3 text-sm",
      md: "h-10 px-4 text-sm",
      lg: "h-11 px-5 text-base",
    };
    return [base, byVariant[variant], bySize[size], className].filter(Boolean).join(" ");
  }, [variant, size, className]);

  async function handleClick() {
    if (disabled || isLoading) return;
    setIsLoading(true);
    setErr(null);
    try {
      const data = await printOrderReceipt(orderId, { copies, sendToPrinter });
      const html =
        data.htmlByCopy.customer ??
        data.htmlByCopy["both"] ??
        Object.values(data.htmlByCopy)[0];

      if (!html) {
        throw new Error("Receipt HTML was not returned by the server.");
      }

      // Open print dialog in a popup (may require popup permissions in the browser).
      openHtmlAndPrint(html, `Receipt #${orderId}`);

      onPrinted?.({
        orderId,
        printed: data.printed,
        copies: data.copies,
      });
    } catch (e: any) {
      const msg =
        e?.message ||
        "Failed to print receipt. Check network and popup settings.";
      setErr(msg);
      onError?.(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isLoading || !orderId}
        className={btnClasses}
        aria-busy={isLoading ? "true" : "false"}
        aria-live="polite"
      >
        {isLoading ? (
          <Spinner className="mr-2" />
        ) : (
          <PrinterIcon className="mr-2" />
        )}
        {children ?? (isLoading ? "Printing…" : "Print Receipt")}
      </button>

      {/* Inline error toast (accessible) */}
      <div
        role="status"
        aria-live="polite"
        className="min-h-0 text-sm"
      >
        {err ? (
          <div className="rounded-lg bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200 px-3 py-2">
            {err}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* =========================
   Minimal inline icons/spinner (no external deps)
========================= */
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin h-4 w-4 ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PrinterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7 3a2 2 0 00-2 2v2h14V5a2 2 0 00-2-2H7z" />
      <path d="M5 9a3 3 0 00-3 3v4a2 2 0 002 2h2v-4h12v4h2a2 2 0 002-2v-4a3 3 0 00-3-3H5z" />
      <path d="M7 17h10v4a2 2 0 01-2 2H9a2 2 0 01-2-2v-4z" />
    </svg>
  );
}
