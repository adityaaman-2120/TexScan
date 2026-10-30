import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/10 text-primary", // accent: neutral / informational
        pass: "border-success/30 bg-success/10 text-success",
        fail: "border-destructive/30 bg-destructive/10 text-destructive",
        warn: "border-warning/30 bg-warning/10 text-warning",
        muted: "border-transparent bg-muted text-muted-foreground",
        outline: "text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean };

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
