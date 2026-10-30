import { CircleCheck, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Decision } from "@/api/types";

/** PASS is green, FAIL is red; the cyan accent is reserved for neutral UI. */
export function DecisionBadge({ decision }: { decision: Decision }) {
  const pass = decision === "PASS";
  return (
    <Badge variant={pass ? "pass" : "fail"} className="num font-semibold tracking-wide">
      {pass ? <CircleCheck /> : <CircleX />}
      {decision}
    </Badge>
  );
}
