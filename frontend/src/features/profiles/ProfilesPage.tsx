import { useEffect, useState } from "react";
import { useProfiles } from "@/api/hooks";
import { METHOD_LABELS, type Method } from "@/api/types";
import { requireNav } from "@/app/nav";
import { EmptyState } from "@/components/EmptyState";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";
import { CreateProfile } from "./CreateProfile";
import { ProfileDetail } from "./ProfileDetail";

const item = requireNav("/profiles");

export function ProfilesPage() {
  const { data: profiles, isPending, isError } = useProfiles();
  const activeId = useUi((s) => s.profileId);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // keep a valid selection: the first profile until the user picks, and a neighbour after a delete
  useEffect(() => {
    if (!profiles) return;
    if (selectedId === null || !profiles.some((p) => p.id === selectedId)) setSelectedId(profiles[0]?.id ?? null);
  }, [profiles, selectedId]);

  const selected = profiles?.find((p) => p.id === selectedId);

  return (
    <>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <CreateProfile onCreated={setSelectedId} />

          <section aria-labelledby="profile-list" className="space-y-2">
            <h2 id="profile-list" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your profiles
            </h2>
            {isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !profiles || profiles.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                {isError ? "The API did not answer. Start the backend with make dev." : "No profiles yet. Create the first one above."}
              </p>
            ) : (
              <Stagger className="space-y-2">
                {profiles.map((p) => (
                  <StaggerItem key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      aria-pressed={p.id === selectedId}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left outline-none transition-colors hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring",
                        p.id === selectedId && "border-primary/60 bg-primary/5",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{p.name}</span>
                          {activeId === p.id && <Badge variant="default">active</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{METHOD_LABELS[p.method as Method] ?? p.method}</div>
                      </div>
                      <div className="num shrink-0 text-right text-xs">
                        <div className="text-primary">{p.report.threshold.toFixed(2)}</div>
                        <div className="text-muted-foreground">{p.report.n_images} images</div>
                      </div>
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </section>
        </div>

        <div className="min-w-0">
          {isPending ? (
            <Card className="gap-4 p-5"><Skeleton className="h-6 w-48" /><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></Card>
          ) : selected ? (
            <ProfileDetail key={selected.id} profile={selected} onDeleted={() => setSelectedId(null)} />
          ) : (
            <Card>
              <EmptyState illustration="profile" title="Learn your first profile" description="A profile stores thresholds tuned on known-good images of one material, so good parts pass and real defects stand out. Upload a few good samples to start." />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
