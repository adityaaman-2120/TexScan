import * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "num pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** ⌘ on Apple platforms, Ctrl elsewhere. */
export const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);
export const modKey = isMac ? "⌘" : "Ctrl";
