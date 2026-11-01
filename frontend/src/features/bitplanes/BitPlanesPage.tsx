import { useState } from "react";
import { useInspections } from "@/api/hooks";
import { requireNav } from "@/app/nav";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dropzone } from "@/features/inspect/Dropzone";
import { useInspectSession } from "@/features/inspect/useInspectSession";
import { BitPlanes } from "./BitPlanes";

const item = requireNav("/bit-planes");
const NONE = "none";

/** The eight bit planes of the grayscale image of a new upload or of a past inspection. */
export function BitPlanesPage() {
  const session = useInspectSession();
  const { data: recent } = useInspections({ limit: 30 });
  const [picked, setPicked] = useState<string>(NONE);
  const pickedId = picked === NONE ? undefined : Number(picked);
  const inspectionId = session.file ? session.result?.id : pickedId;

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); session.acceptFile(e.dataTransfer.files[0]); }}>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card className="gap-3 p-3 py-3">
            <Dropzone compact onFile={(f) => { setPicked(NONE); session.acceptFile(f); }} />
            <p className="px-1 text-[11px] leading-snug text-muted-foreground">A new image is also inspected and saved to History.</p>
          </Card>
          <Card className="gap-2 p-3 py-3">
            <div className="px-1 text-xs font-medium">Or use a past inspection</div>
            <Select value={picked} onValueChange={setPicked} disabled={!recent?.items.length}>
              <SelectTrigger aria-label="Past inspection">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {recent?.items.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    #{r.id} {r.filename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>
        </aside>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Bit planes</CardTitle>
            <CardDescription>Plane k is bit k of every pixel: the high planes carry the picture, the low ones look like noise.</CardDescription>
          </CardHeader>
          <CardContent className="max-w-xl">
            {inspectionId === undefined && !session.file ? (
              <EmptyState illustration="stack" title="Add an image or pick a past inspection" description="Its eight binary layers will appear here." />
            ) : (
              <BitPlanes inspectionId={inspectionId} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
