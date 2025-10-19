// ✅ CARD_COMPONENTS — apps/web/components/ui/Card.tsx
import { PropsWithChildren, ReactNode } from "react";

/* ---------- Base Card ---------- */
export function Card({ children }: PropsWithChildren) {
  return (
    <div className="rounded-[var(--radius-2xl)] border bg-white shadow-[var(--shadow-card)]">
      {children}
    </div>
  );
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="p-5">{children}</div>;
}

/* ---------- Loading Shimmer ---------- */
function Shimmer({ lines = 2 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-6 w-24 rounded bg-gray-200/70" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 w-32 rounded bg-gray-200/70" />
      ))}
    </div>
  );
}

/* ---------- Stat Card (polished) ----------
   - Colored badge based on intent
   - Subtle hover/press states
   - Loading shimmer when `loading` is true
------------------------------------------- */
type StatIntent = "neutral" | "success" | "warning" | "danger";

const intentClasses: Record<StatIntent, string> = {
  neutral: "bg-gray-100 text-gray-800",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
};

export function Stat({
  title,
  value,
  sub,
  icon,
  intent = "neutral",
  loading = false,
}: {
  title: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
  intent?: StatIntent;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-[var(--radius-2xl)] border bg-white shadow-[var(--shadow-card)]
                 transition hover:shadow-lg hover:-translate-y-[1px] active:translate-y-0"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-600">{title}</p>

            {/* value / shimmer */}
            <div className="mt-2">
              {loading ? (
                <Shimmer lines={1} />
              ) : (
                <p className="text-3xl font-semibold leading-none tracking-tight truncate">
                  {value}
                </p>
              )}
            </div>

            {/* subtext */}
            {!!sub && !loading && (
              <p className="mt-1 text-xs text-gray-500">{sub}</p>
            )}
          </div>

          {/* icon badge */}
          {icon && (
            <div
              className={`grid h-10 w-10 place-items-center rounded-xl ${intentClasses[intent]}`}
              aria-hidden="true"
            >
              {/* icons come sized from caller */}
              {icon}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
