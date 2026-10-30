import { Circle } from "lucide-react";
import type { NavItem } from "@/app/nav";
import { useProfiles } from "@/api/hooks";
import { EmptyState } from "@/components/EmptyState";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUi } from "@/store/ui";

/** Shared placeholder: what the page will do, which endpoint backs it, and which profile is active. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  const profileId = useUi((s) => s.profileId);
  const { data: profiles, isPending } = useProfiles();
  const profile = profiles?.find((p) => p.id === profileId);

  return (
    <>
      <PageHeader
        icon={item.icon}
        title={item.label}
        description={item.description}
        actions={
          <Badge variant="warn" dot>
            Placeholder
          </Badge>
        }
      />
      <Stagger className="grid gap-4 lg:grid-cols-3">
        <StaggerItem className="lg:col-span-2">
          <Card className="h-full">
            <CardContent>
              <EmptyState
                illustration={item.illustration}
                title="This workspace is not built yet"
                description="The shell, theme and navigation are in place. The interactive tools for this page come next."
              />
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Planned</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {item.planned.map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-[13px] text-muted-foreground">
                    <Circle className="mt-[5px] size-2 shrink-0 fill-primary/30 stroke-primary" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Wiring</CardTitle>
              <CardDescription>Backend this page will call</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <code className="num block rounded-md border bg-muted/50 px-2.5 py-2 text-xs leading-relaxed text-primary">{item.endpoint}</code>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Active profile</span>
                {isPending ? (
                  <Skeleton className="h-4 w-20" />
                ) : (
                  <span className="num">{profile ? profile.name : "defaults"}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>
    </>
  );
}
