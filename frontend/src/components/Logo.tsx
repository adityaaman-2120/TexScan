import { cn } from "@/lib/utils";
import { LOGO, logoBars, logoFinder } from "./logoGeometry";

/** The TexScan mark: a woven tile with a scanner's viewfinder on one cell. Drawn from the geometry in logo.ts. */
export function LogoMark({ className }: { className?: string }) {
  const { colors, size, tileRadius, barRadius, finder: f } = LOGO;
  const fin = logoFinder();
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={cn("size-8", className)} role="img" aria-label="TexScan">
      <rect width={size} height={size} rx={tileRadius} fill={colors.tile} />
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} rx={tileRadius - 0.5} fill="none" stroke={colors.edge} strokeOpacity="0.28" />
      <g fill={colors.bar}>
        {logoBars().map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} rx={barRadius} />
        ))}
      </g>
      <rect x={fin.x} y={fin.y} width={fin.side} height={fin.side} rx={f.radius} fill="none" stroke={colors.accent} strokeWidth={f.stroke} />
      <circle cx={fin.cx} cy={fin.cy} r={f.dot} fill={colors.accent} />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <div className="flex flex-col gap-1 leading-none">
          <span className="text-[15px] font-semibold tracking-tight">TexScan</span>
          <span className="text-[10px] leading-tight text-muted-foreground">Fabric inspection for small textile units</span>
        </div>
      )}
    </div>
  );
}
