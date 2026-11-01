import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import { fileUrl } from "@/api/client";
import { requireNav } from "@/app/nav";
import { DecisionBadge } from "@/components/DecisionBadge";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ControlPanel } from "@/features/inspect/ControlPanel";
import { Dropzone } from "@/features/inspect/Dropzone";
import { stageInfo } from "@/features/inspect/stageInfo";
import { useInspectSession } from "@/features/inspect/useInspectSession";
import { XRay } from "@/features/inspect/XRay";

const item = requireNav("/xray");

/** Every stage image of one inspection, with what the stage does and how long it took. */
export function XRayPage() {
  const session = useInspectSession();
  const { result, running } = session;
  const [walkthrough, setWalkthrough] = useState(false);

  const stages = useMemo(
    () =>
      result
        ? Object.entries(result.stage_urls).map(([name, url]) => {
            const info = stageInfo(name, result.config);
            return { name, url, info, ms: info.timing ? result.timings_ms[info.timing] : undefined };
          })
        : [],
    [result],
  );

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); session.acceptFile(e.dataTransfer.files[0]); }}>
      <PageHeader
        icon={item.icon}
        title={item.label}
        description={item.description}
        actions={
          result && (
            <Button onClick={() => setWalkthrough(true)}>
              <Play />
              Step-by-step walkthrough
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <ControlPanel session={session} />
        </aside>

        <div className="order-1 min-w-0 space-y-5 lg:order-2">
          {!session.file ? (
            <>
              <Dropzone onFile={session.acceptFile} />
              <Card>
                <EmptyState illustration="scan" title="Add an image to see every stage" description="Each processing step is shown in order, from the original to the final overlay, with what it does and how long it took." />
              </Card>
            </>
          ) : (
            <>
              <Card className="py-4">
                <CardContent className="flex flex-wrap items-center gap-4">
                  {result ? <DecisionBadge decision={result.decision} /> : <Skeleton className="h-6 w-16" />}
                  <span className="num text-sm text-muted-foreground">
                    {result ? `${result.metrics.defect_count} defects · ${Math.round(result.metrics.total_ms)} ms total` : "Running…"}
                  </span>
                </CardContent>
              </Card>

              {result ? (
                <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Processing stages" aria-busy={running}>
                  {stages.map((s, i) => (
                    <li key={s.name}>
                      <Card className="h-full gap-3 overflow-hidden py-0">
                        <img src={fileUrl(s.url)} alt={s.info.title} loading="lazy" className="aspect-[4/3] w-full bg-black/40 object-contain" />
                        <CardHeader className="gap-1 px-4 pb-4">
                          <CardTitle className="flex items-baseline justify-between gap-2 text-sm">
                            <span>
                              <span className="num mr-1.5 text-muted-foreground">{i + 1}.</span>
                              {s.info.title}
                            </span>
                            {s.ms !== undefined && <span className="num text-xs font-normal text-muted-foreground">{s.ms.toFixed(1)} ms</span>}
                          </CardTitle>
                          <CardDescription className="text-xs leading-snug">{s.info.explain}</CardDescription>
                          {s.info.formula && <code className="num mt-1 block text-[11px] text-primary">{s.info.formula}</code>}
                        </CardHeader>
                      </Card>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-64 w-full" />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {result && <XRay result={result} open={walkthrough} onOpenChange={setWalkthrough} />}
    </div>
  );
}
