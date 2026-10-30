import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

/** Single-choice toggle group; clicking the active segment keeps it selected. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  className?: string;
  label: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn("inline-flex flex-wrap gap-0.5 rounded-lg border bg-muted/40 p-0.5", className)}
    >
      {options.map(({ value: v, label: text, icon: Icon, disabled }) => (
        <ToggleGroup.Item
          key={v}
          value={v}
          disabled={disabled}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:ring-1 data-[state=on]:ring-border [&_svg]:size-3.5"
        >
          {Icon && <Icon />}
          {text}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
