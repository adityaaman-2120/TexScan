import { cn } from "@/lib/utils";

/** Scan-bracket mark with a single thread line, in the accent color. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary/10" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" className="stroke-primary/30" />
      <path
        d="M8 12V9a1 1 0 0 1 1-1h3M20 8h3a1 1 0 0 1 1 1v3M24 20v3a1 1 0 0 1-1 1h-3M12 24H9a1 1 0 0 1-1-1v-3"
        className="stroke-primary"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M11 16h10" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="text-[15px] font-semibold tracking-tight">TexScan</span>
          <span className="num text-[10px] text-muted-foreground">v0.1</span>
        </div>
      )}
    </div>
  );
}
