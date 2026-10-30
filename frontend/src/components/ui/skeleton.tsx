import * as React from "react";
import { cn } from "@/lib/utils";

/** Shimmering placeholder: a moving highlight over a muted block. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.06] before:to-transparent",
        className,
      )}
      {...props}
    />
  );
}
