// File: apps/web/components/menu/ConfirmDialog.tsx
// --------------------------------
"use client";

import React from "react";

type Props = {
  title: string;
  description?: string;
  confirmText?: string;
  confirmVariant?: "default" | "danger";
  onConfirm: () => Promise<void> | void;
  /** Optional custom trigger node */
  trigger?: React.ReactNode;
};

export function ConfirmDialog({
  title,
  description,
  confirmText = "Confirm",
  confirmVariant = "default",
  onConfirm,
  trigger,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const titleId = React.useId();

  // Lock body scroll + ESC to close while open
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const confirmBtn =
    confirmVariant === "danger"
      ? "bg-rose-600 hover:brightness-110"
      : "bg-brand hover:brightness-110";

  return (
    <>
      {trigger ? (
        <span
          role="button"
          tabIndex={0}
          className="inline-flex"
          onClick={() => setOpen(true)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
        >
          {trigger}
        </span>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-lg px-3 py-1 border">
          {confirmVariant === "danger" ? "Delete" : "Confirm"}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100002] grid place-items-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />

          {/* Panel — FORCE OPAQUE */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-[100003] w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 ring-1 ring-black/10 dark:ring-white/10 shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={titleId} className="text-lg font-semibold">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm text-black/70 dark:text-white/70">{description}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2 border"
                autoFocus
                disabled={busy}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={busy}
                className={`rounded-xl px-4 py-2 text-white shadow disabled:opacity-60 ${confirmBtn}`}
              >
                {busy ? "Working..." : confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ConfirmDialog;
