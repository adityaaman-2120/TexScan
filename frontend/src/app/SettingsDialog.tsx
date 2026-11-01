import { Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useUi } from "@/store/ui";

/** App settings. Engineering mode is remembered between visits. */
export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const engineering = useUi((s) => s.engineering);
  const setEngineering = useUi((s) => s.setEngineering);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-base font-semibold">Settings</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">TexScan: affordable fabric inspection for small textile units.</DialogDescription>

        <div className="mt-2 flex items-start gap-4 rounded-lg border p-4">
          <Wrench className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <div id="engineering-label" className="text-sm font-medium">
              Engineering mode
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Adds an Engineering section to the sidebar and shows every detailed control on the Inspect page. Leave it off for everyday inspection.
            </p>
          </div>
          <Switch checked={engineering} onCheckedChange={setEngineering} aria-labelledby="engineering-label" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
