import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Slider({ className, "aria-label": ariaLabel, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = props.value ?? props.defaultValue ?? [props.min ?? 0];
  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none select-none items-center py-2 data-[disabled]:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {thumbs.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={ariaLabel}
          className="block size-4 rounded-full border-2 border-primary bg-background shadow outline-none transition-shadow hover:ring-4 hover:ring-primary/20 focus-visible:ring-4 focus-visible:ring-ring"
        />
      ))}
    </SliderPrimitive.Root>
  );
}
