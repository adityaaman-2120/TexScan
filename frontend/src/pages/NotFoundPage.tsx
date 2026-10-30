import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <EmptyState
      className="py-24"
      illustration="search"
      title="Page not found"
      description="That address does not match any workspace."
      action={
        <Button asChild size="sm">
          <Link to="/inspect">Back to Inspect</Link>
        </Button>
      }
    />
  );
}
