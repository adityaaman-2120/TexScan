import { SlidersHorizontal } from "lucide-react";
import { useEffect } from "react";
import { useProfiles } from "@/api/hooks";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";

const NONE = "none";

/** The profile used by inspections (stored in the UI store, persisted across reloads). */
export function ProfileSelector({ className }: { className?: string }) {
  const { data: profiles, isPending } = useProfiles();
  const profileId = useUi((s) => s.profileId);
  const setProfileId = useUi((s) => s.setProfileId);

  // a saved profile may have been deleted meanwhile
  useEffect(() => {
    if (profiles && profileId !== null && !profiles.some((p) => p.id === profileId)) setProfileId(null);
  }, [profiles, profileId, setProfileId]);

  if (isPending) return <Skeleton className={cn("h-9 w-[9.5rem] sm:w-52", className)} />;

  return (
    <Select value={profileId === null ? NONE : String(profileId)} onValueChange={(v) => setProfileId(v === NONE ? null : Number(v))}>
      <SelectTrigger className={cn("w-[9.5rem] sm:w-52", className)} aria-label="Active profile">
        <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={NONE} hint="default">
          No profile
        </SelectItem>
        {profiles && profiles.length > 0 && <SelectSeparator />}
        {profiles?.map((p) => (
          <SelectItem key={p.id} value={String(p.id)} hint={p.method}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
