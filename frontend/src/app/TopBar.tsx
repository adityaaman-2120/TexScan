import { Menu, Search } from "lucide-react";
import { useLocation } from "react-router-dom";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Kbd, modKey } from "@/components/ui/kbd";
import { useUi } from "@/store/ui";
import { navItemFor } from "./nav";
import { ProfileSelector } from "./ProfileSelector";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  const { pathname } = useLocation();
  const item = navItemFor(pathname);
  const setMobileNavOpen = useUi((s) => s.setMobileNavOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/70 px-3 backdrop-blur-md sm:gap-3 sm:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>
      <LogoMark className="size-7 md:hidden" />

      <div className="hidden min-w-0 items-center gap-2 text-sm md:flex">
        {item && <item.icon className="size-4 text-primary" />}
        <span className="truncate font-medium">{item?.label ?? "Not found"}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ProfileSelector />
        <Button
          variant="outline"
          onClick={() => setPaletteOpen(true)}
          className="w-9 justify-center gap-2 px-0 text-muted-foreground sm:w-52 sm:justify-between sm:px-3"
          aria-label="Open command palette"
        >
          <span className="flex items-center gap-2">
            <Search className="size-4" />
            <span className="hidden sm:inline">Jump to…</span>
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
