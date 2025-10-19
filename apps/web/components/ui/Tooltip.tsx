// ✅ TOOLTIP_WRAPPER — apps/web/components/ui/Tooltip.tsx
"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { PropsWithChildren, ReactNode } from "react";

export function Tooltip({
  content,
  children,
}: PropsWithChildren<{ content: ReactNode }>) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root delayDuration={200}>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="right"
            align="center"
            className="z-50 rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-gray-900" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
