import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUi } from "@/store/ui";
import { CommandPalette } from "./CommandPalette";
import { DesktopSidebar, MobileSidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Blueprint grid and a soft cyan glow behind everything. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(ellipse_50%_100%_at_50%_0%,var(--glow),transparent)]" />
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_90%_65%_at_50%_0%,black,transparent_85%)]" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useUi((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Ctrl/Cmd + B collapses the sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        useUi.getState().toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative flex min-h-dvh">
        <Backdrop />
        <DesktopSidebar />
        <MobileSidebar />
        <div className="relative z-10 flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-10">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
        <CommandPalette />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
