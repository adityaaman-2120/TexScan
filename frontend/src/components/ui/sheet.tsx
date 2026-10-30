import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";
import { DialogOverlay } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

const SIDES = {
  left: "inset-y-0 left-0 w-72 max-w-[85vw] border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  right: "inset-y-0 right-0 w-[min(100vw,720px)] border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
} as const;

/** Slide-over panel: from the left for the mobile navigation, from the right for detail drawers. */
export function SheetContent({
  className,
  children,
  side = "left",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: keyof typeof SIDES }) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex h-dvh flex-col bg-sidebar shadow-2xl outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-200",
          SIDES[side],
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
