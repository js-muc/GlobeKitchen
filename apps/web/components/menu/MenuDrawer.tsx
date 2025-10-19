// File: apps/web/components/menu/MenuDrawer.tsx
// --------------------------------
import React, { useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { menuItemSchema, type MenuItemForm } from "@/lib/validators/menu";
import type { MenuItem } from "@/lib/types/menu";

export function MenuDrawer({
  mode,
  initial,
  onSubmit,
  trigger,
}: {
  mode: "create" | "edit";
  initial?: MenuItem;
  onSubmit: (payload: MenuItemForm) => Promise<void> | void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<MenuItemForm>({
    // Let the resolver infer types from the schema (avoids version-specific generic mismatches)
    resolver: zodResolver(menuItemSchema),
    defaultValues: initial
      ? {
          name: initial.name,
          category: initial.category,
          unit: initial.unit,
          priceSell: initial.priceSell, // number
          costUnit: initial.costUnit ?? undefined, // show empty input when null
          active: initial.active,
        }
      : {
          name: "",
          category: "",
          unit: "plate",
          priceSell: 0,
          costUnit: undefined,
          active: true,
        },
  });

  // Preserve original edit behavior
  useEffect(() => {
    if (open && initial) {
      reset({
        name: initial.name,
        category: initial.category,
        unit: initial.unit,
        priceSell: initial.priceSell,
        costUnit: initial.costUnit ?? undefined,
        active: initial.active,
      });
    }
  }, [open, initial, reset]);

  // UX: lock body scroll + ESC to close
  useEffect(() => {
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

  // Strongly typed handler to satisfy RHF's SubmitHandler<T>
  const onValid: SubmitHandler<MenuItemForm> = async (values) => {
    await onSubmit({
      ...values,
      // ensure numeric payload for backend
      priceSell: Number(values.priceSell),
      costUnit:
        values.costUnit === undefined || (values as any).costUnit === ""
          ? null
          : Number(values.costUnit),
    });
    setOpen(false);
  };

  return (
    <>
      {trigger ? (
        <span
          onClick={() => setOpen(true)}
          className="inline-flex"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}
        >
          {trigger}
        </span>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl border px-3 py-1 text-sm"
        >
          {mode === "create" ? "Add Item" : "Edit"}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[10000]">
          {/* Backdrop (click to close) */}
          <div
            className="absolute inset-0 z-[10000] bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Right-side drawer panel (fully opaque & above backdrop) */}
          <div className="relative z-[10001] flex h-full">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="menu-drawer-title"
              className="ml-auto h-full w-full md:w-[420px]
                         bg-white dark:bg-neutral-900 bg-opacity-100
                         border-l shadow-2xl ring-1 ring-black/5
                         p-4 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 id="menu-drawer-title" className="text-lg font-semibold">
                  {mode === "create" ? "Add Menu Item" : "Edit Menu Item"}
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-1 border"
                >
                  Close
                </button>
              </div>

              {/* use the typed handler */}
              <form onSubmit={handleSubmit(onValid)} className="mt-4 space-y-3">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <input
                    autoFocus
                    {...register("name")}
                    className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
                  />
                  {errors.name && (
                    <p className="text-xs text-rose-600 mt-1">{errors.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Category</label>
                  <input
                    {...register("category")}
                    className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
                  />
                  {errors.category && (
                    <p className="text-xs text-rose-600 mt-1">{errors.category.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="text-sm font-medium">Unit</label>
                    <input
                      {...register("unit")}
                      className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
                    />
                    {errors.unit && (
                      <p className="text-xs text-rose-600 mt-1">{errors.unit.message}</p>
                    )}
                  </div>

                  <div className="sm:col-span-1">
                    <label className="text-sm font-medium">Price (KES)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      // numbers only; empty -> NaN -> schema "required" will catch
                      {...register("priceSell", { valueAsNumber: true })}
                      className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
                    />
                    {errors.priceSell && (
                      <p className="text-xs text-rose-600 mt-1">{errors.priceSell.message}</p>
                    )}
                  </div>

                  <div className="sm:col-span-1">
                    <label className="text-sm font-medium">Cost (KES)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      // allow empty -> undefined (optional), otherwise number
                      {...register("costUnit", {
                        setValueAs: (v) =>
                          v === "" || v === null || typeof v === "undefined" ? undefined : Number(v),
                      })}
                      className="mt-1 w-full rounded-xl border px-3 py-2 bg-background"
                    />
                    {errors.costUnit && (
                      <p className="text-xs text-rose-600 mt-1">
                        {errors.costUnit.message as string}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input id="active" type="checkbox" {...register("active")} className="h-4 w-4" />
                  <label htmlFor="active" className="text-sm">Active</label>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-4 py-2 border"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-xl px-4 py-2 text-white bg-brand shadow hover:brightness-110 disabled:opacity-60"
                  >
                    {mode === "create" ? "Create" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
