import { TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import type { InspectionOut } from "@/api/types";
import { coverageOf } from "./coverage";

/**
 * What this check covered, under the verdict. A PASS only means "nothing found where it looked", so when the settings
 * leave blind spots (edges skipped, small defects ignored, a shrunk picture) a PASS says so instead of sounding certain.
 */
export function CoverageNote({ result }: { result: InspectionOut }) {
  const c = coverageOf(result.config, result.metrics.image_width, result.metrics.image_height);
  const pass = result.decision === "PASS";
  return (
    <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
      <p>
        Checked {c.region}
        {c.smallest ? `. The smallest defect that counts is about ${c.smallest} of it.` : "."}
      </p>
      {pass && c.limits.length > 0 && (
        <div role="note" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">This pass has limits.</p>
            {c.limits.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p>
              For small defects, make a <Link to="/profiles" className="text-primary underline-offset-4 hover:underline">profile</Link> from good pictures of this same fabric, and check a few results by eye.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
