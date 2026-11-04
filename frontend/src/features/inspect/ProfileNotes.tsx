import { TriangleAlert } from "lucide-react";
import { useProfiles } from "@/api/hooks";
import { useUi } from "@/store/ui";
import { profileNotes } from "./coverage";

/** The selected profile's own warnings, shown where it is chosen. They are produced when the profile is learned and easy to miss there. */
export function ProfileNotes() {
  const profileId = useUi((s) => s.profileId);
  const { data: profiles } = useProfiles();
  const profile = profiles?.find((p) => p.id === profileId);
  const warnings = [...(profile ? profileNotes(profile.config) : []), ...(profile?.report.warnings ?? [])];
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Warnings about this profile">
      {warnings.slice(0, 4).map((w) => (
        <li key={w} className="flex items-start gap-1.5 text-[11px] leading-snug text-warning">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          {w}
        </li>
      ))}
    </ul>
  );
}
