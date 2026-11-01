import { Plus } from "lucide-react";
import { useState } from "react";
import { requireNav } from "@/app/nav";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { NewRollDialog } from "./NewRollDialog";
import { RollsList } from "./RollsList";

const item = requireNav("/roll");

/** Roll Inspection: every roll, and the way to start a new one. */
export function RollsPage() {
  const [creating, setCreating] = useState(false);
  const newRoll = (
    <Button onClick={() => setCreating(true)}>
      <Plus />
      New roll
    </Button>
  );
  return (
    <>
      <PageHeader icon={item.icon} title={item.label} description={item.description} actions={newRoll} />
      <RollsList />
      <NewRollDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
