import { Moon, PanelLeft, Settings, SlidersHorizontal, Sun, Wrench } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProfiles } from "@/api/hooks";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { modKey } from "@/components/ui/kbd";
import { useUi } from "@/store/ui";
import { paletteItems } from "./nav";

/** Ctrl/Cmd + K: jump to any page, switch profile, or flip a setting. */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const engineering = useUi((s) => s.engineering);
  const setEngineering = useUi((s) => s.setEngineering);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const profileId = useUi((s) => s.profileId);
  const setProfileId = useUi((s) => s.setProfileId);
  const navigate = useNavigate();
  const { data: profiles } = useProfiles();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useUi.getState().setPaletteOpen(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page, switch profile, change theme…" />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>
        <CommandGroup heading="Go to">
          {paletteItems(engineering).map((item) => (
            <CommandItem key={item.path} value={item.label} keywords={item.keywords} onSelect={run(() => navigate(item.path))}>
              <item.icon />
              <span>{item.label}</span>
              <span className="ml-auto hidden max-w-[55%] truncate text-xs text-muted-foreground sm:inline">{item.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Profile">
          <CommandItem value="use no profile defaults" onSelect={run(() => setProfileId(null))}>
            <SlidersHorizontal />
            <span>No profile (defaults)</span>
            {profileId === null && <CommandShortcut>active</CommandShortcut>}
          </CommandItem>
          {profiles?.map((p) => (
            <CommandItem key={p.id} value={`use profile ${p.name}`} keywords={[p.method]} onSelect={run(() => setProfileId(p.id))}>
              <SlidersHorizontal />
              <span>Use profile: {p.name}</span>
              <CommandShortcut>{profileId === p.id ? "active" : p.method}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="toggle theme dark light" keywords={["appearance", "mode"]} onSelect={run(toggleTheme)}>
            {theme === "dark" ? <Sun /> : <Moon />}
            <span>Switch to {theme === "dark" ? "light" : "dark"} theme</span>
          </CommandItem>
          <CommandItem value="open settings preferences" onSelect={run(() => setSettingsOpen(true))}>
            <Settings />
            <span>Settings</span>
          </CommandItem>
          <CommandItem value="engineering mode toggle advanced tools" keywords={["developer", "advanced"]} onSelect={run(() => setEngineering(!engineering))}>
            <Wrench />
            <span>Turn Engineering mode {engineering ? "off" : "on"}</span>
          </CommandItem>
          <CommandItem value="toggle sidebar collapse expand" onSelect={run(toggleSidebar)}>
            <PanelLeft />
            <span>Collapse / expand sidebar</span>
            <CommandShortcut>{modKey} B</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
