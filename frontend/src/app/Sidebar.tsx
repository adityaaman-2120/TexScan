import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useHealth } from "@/api/hooks";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";
import { navGroups, sidebarItems, type NavItem } from "./nav";

type Variant = "desktop" | "mobile";

function ApiStatus({ collapsed }: { collapsed: boolean }) {
  const { isPending, isError } = useHealth();
  const state = isPending ? "checking" : isError ? "offline" : "online";
  const label = { checking: "Checking API…", offline: "API offline", online: "API online" }[state];
  const color = { checking: "bg-warning", offline: "bg-destructive", online: "bg-success" }[state];

  const dot = (
    <span className="relative flex size-2.5 shrink-0">
      {state === "online" && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-40", color)} />}
      <span className={cn("relative inline-flex size-2.5 rounded-full", color)} />
    </span>
  );
  const body = (
    <div className="flex h-9 items-center gap-2.5 px-3 text-xs text-muted-foreground" role="status">
      {dot}
      {!collapsed && <span className="num">{label}</span>}
    </div>
  );
  if (!collapsed) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavRow({ item, collapsed, variant, onNavigate }: { item: NavItem; collapsed: boolean; variant: Variant; onNavigate?: () => void }) {
  const link = (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={`nav-pill-${variant}`}
              className="absolute inset-0 rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/25"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          {!isActive && <span className="absolute inset-0 rounded-lg bg-accent/0 transition-colors group-hover:bg-accent/60" />}
          <item.icon className={cn("relative size-[18px] shrink-0", isActive && "text-primary")} />
          {!collapsed && <span className="relative truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarBody({ collapsed, variant, onNavigate }: { collapsed: boolean; variant: Variant; onNavigate?: () => void }) {
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const engineering = useUi((s) => s.engineering);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex h-14 shrink-0 items-center border-b", collapsed ? "justify-center" : "px-4")}>
        <a href="/" aria-label="TexScan home" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
          <Logo collapsed={collapsed} />
        </a>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {navGroups(engineering).map((group) => (
          <div key={group}>
            {collapsed ? (
              <div className="mx-3 mb-2 h-px bg-border" />
            ) : (
              <div className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">{group}</div>
            )}
            <div className="space-y-0.5">
              {sidebarItems(group, engineering).map((item) => (
                <NavRow key={item.path} item={item} collapsed={collapsed} variant={variant} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t p-2.5">
        <ApiStatus collapsed={collapsed} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          className={cn("w-full text-muted-foreground", collapsed ? "justify-center px-0" : "justify-start px-3")}
          aria-label="Settings"
        >
          <Settings />
          {!collapsed && <span>Settings</span>}
          {!collapsed && engineering && <span className="ml-auto rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">Engineering</span>}
        </Button>
        {variant === "desktop" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={cn("w-full text-muted-foreground", collapsed ? "justify-center px-0" : "justify-start px-3")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Fixed left rail from the md breakpoint up; animates between 248 px and 68 px. */
export function DesktopSidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 248 }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      className="sticky top-0 z-20 hidden h-dvh shrink-0 overflow-hidden border-r bg-sidebar/90 backdrop-blur md:block"
    >
      <SidebarBody collapsed={collapsed} variant="desktop" />
    </motion.aside>
  );
}

/** The same navigation as a slide-over, for screens below md. */
export function MobileSidebar() {
  const open = useUi((s) => s.mobileNavOpen);
  const setOpen = useUi((s) => s.setMobileNavOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Jump to a page</SheetDescription>
        <SidebarBody collapsed={false} variant="mobile" onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
