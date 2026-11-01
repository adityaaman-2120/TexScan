import { Ruler } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface SizeNoteProps {
  /** Whether the inspection's profile has a size calibration. */
  calibrated: boolean;
  /** Profile the inspection used; null when none. */
  profileId: number | null;
}

/** Above a defect list: "Not calibrated" with the way to fix it, or a reminder that sizes are real-world. */
export function SizeNote({ calibrated, profileId }: SizeNoteProps) {
  if (calibrated) {
    return (
      <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Ruler className="size-3.5 text-primary" aria-hidden />
        Sizes are real-world: millimetres, with inches underneath.
      </p>
    );
  }
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <Badge variant="warn" dot>
        Not calibrated
      </Badge>
      <span>Sizes are in pixels.</span>
      {profileId !== null ? (
        <Link to={`/profiles/${profileId}/calibration`} className="text-primary underline-offset-4 hover:underline">
          Calibrate this profile
        </Link>
      ) : (
        <Link to="/profiles" className="text-primary underline-offset-4 hover:underline">
          Choose or make a profile to calibrate
        </Link>
      )}
    </div>
  );
}
