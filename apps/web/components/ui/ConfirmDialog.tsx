// ✅ CONFIRM_DIALOG (RESPONSIVE: MODAL on desktop, SHEET on mobile)
// apps/web/components/ui/ConfirmDialog.tsx
"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;   // default "Delete"
  cancelText?: string;    // default "Cancel"
  danger?: boolean;       // red confirm styling
  busy?: boolean;         // disable buttons + show "..."
  onConfirm: () => void;
  onClose: () => void;    // close for both cancel & esc/backdrop
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button when opening
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => confirmBtnRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Esc to close + tiny focus trap between the 2 buttons
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const nodes = [cancelBtnRef.current, confirmBtnRef.current].filter(Boolean) as HTMLElement[];
        if (nodes.length < 2) return;
        const idx = nodes.indexOf(document.activeElement as HTMLElement);
        if (idx === -1) return;
        e.preventDefault();
        const next = e.shiftKey ? (idx - 1 + nodes.length) % nodes.length : (idx + 1) % nodes.length;
        nodes[next].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // Backdrop: on small screens we align bottom for “sheet”; on sm+ we center.
    <div
      className="fixed inset-0 z-[100] bg-black/40 p-0 sm:p-4
                 flex sm:grid sm:place-items-center items-end"
      onMouseDown={(e) => {
        // backdrop close (ignore clicks inside panel)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        // Mobile: full width bottom sheet with rounded top and safe-area padding.
        // Desktop: centered card with max width.
        className="w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl bg-white shadow-xl
                   outline-none sm:p-5 p-4
                   pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <h3 id="confirm-title" className="text-base sm:text-lg font-semibold">
          {title}
        </h3>
        {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}

        {/* Buttons: stack on mobile, row on desktop */}
        <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 w-full sm:w-auto"
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={
              danger
                ? "rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 w-full sm:w-auto"
                : "rounded-xl bg-[color:var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 w-full sm:w-auto"
            }
          >
            {busy ? "Working…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
