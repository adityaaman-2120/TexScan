import { Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUi } from "@/store/ui";

/** Shown instead of an engineering page while Engineering mode is off (for example from a saved link). */
export function EngineeringGate() {
  const setEngineering = useUi((s) => s.setEngineering);
  return (
    <>
      <PageHeader icon={Wrench} title="Engineering tools" description="Advanced tools for tuning and diagnosing inspections." />
      <Card>
        <CardContent>
          <EmptyState
            illustration="profile"
            title="Engineering mode is off"
            description="This page is part of the engineering tools. Turn Engineering mode on to use it, or carry on with everyday inspection."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setEngineering(true)}>Turn on Engineering mode</Button>
                <Button variant="outline" asChild>
                  <Link to="/inspect">Back to Inspect</Link>
                </Button>
              </div>
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
