import { Illustration, type IllustrationVariant } from "@/components/Illustration";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  illustration: IllustrationVariant;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ illustration, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-10 text-center", className)}>
      <Illustration variant={illustration} className="mb-5" />
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
