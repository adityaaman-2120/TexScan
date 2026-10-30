import { Toaster as Sonner } from "sonner";
import { useUi } from "@/store/ui";

/** Toasts styled with the app tokens; follows the theme toggle. */
export function Toaster() {
  const theme = useUi((s) => s.theme);
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!bg-popover !text-popover-foreground !border-border !shadow-xl !rounded-lg",
          title: "!text-sm !font-medium",
          description: "!text-[13px] !text-muted-foreground",
          error: "!border-destructive/40",
          success: "!border-success/40",
          warning: "!border-warning/40",
        },
      }}
    />
  );
}
