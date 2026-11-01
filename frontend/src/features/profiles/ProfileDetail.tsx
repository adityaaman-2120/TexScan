import { Check, Ruler, TriangleAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useDeleteProfile } from "@/api/hooks";
import type { ProfileOut } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMethodLabel } from "@/lib/methodLabel";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";
import { ScoreHistogram } from "./ScoreHistogram";

function Fact({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3.5 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("num mt-1 truncate text-xl font-semibold", tone)}>{value}</dd>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ProfileDetail({ profile, onDeleted }: { profile: ProfileOut; onDeleted: () => void }) {
  const { report } = profile;
  const activeId = useUi((s) => s.profileId);
  const engineering = useUi((s) => s.engineering);
  const labelOf = useMethodLabel();
  const setProfileId = useUi((s) => s.setProfileId);
  const remove = useDeleteProfile();
  const [confirming, setConfirming] = useState(false);
  const active = activeId === profile.id;
  const loo = report.loo_pass_rate;

  return (
    <Card className="gap-5">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="truncate text-lg">{profile.name}</CardTitle>
            <Badge variant="outline">{labelOf(profile.method)}</Badge>
            {active && <Badge variant="default">active</Badge>}
          </div>
          <CardDescription className="mt-1">
            Learned from {report.n_images} good images{engineering ? ` · ${report.quantile}th percentile` : ""} · {new Date(profile.created_at).toLocaleDateString()}
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant={active ? "secondary" : "default"} size="sm" onClick={() => setProfileId(active ? null : profile.id)}>
            {active ? "Stop using" : "Use this profile"}
          </Button>
          {confirming ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(profile.id, {
                    onSuccess: () => {
                      toast.success(`Profile "${profile.name}" deleted`, { description: "Its past inspections are kept." });
                      if (active) setProfileId(null);
                      onDeleted();
                    },
                  })
                }
              >
                <Check />
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${profile.name}`} onClick={() => setConfirming(true)} className="text-muted-foreground hover:text-destructive">
              <Trash2 />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <dl className={cn("grid grid-cols-2 gap-3", engineering && "lg:grid-cols-4")}>
          {engineering && <Fact label="Learned threshold" value={report.threshold.toFixed(2)} hint={report.threshold_param} tone="text-primary" />}
          <Fact label={engineering ? "Minimum area" : "Smallest defect"} value={`${report.min_area} px`} hint="smaller regions are ignored" />
          <Fact label="Expected pass rate" value={`${Math.round(loo * 100)}%`} hint={engineering ? "leave-one-out estimate" : "of good fabric, expected to pass"} tone={loo >= 0.95 ? "text-success" : loo >= 0.8 ? "text-warning" : "text-destructive"} />
          {engineering && <Fact label="Largest false region" value={`${report.fp_max_area} px`} hint={`${report.fp_component_count} found in the good samples`} />}
        </dl>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3.5 py-3">
          <Ruler className="size-4 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Size calibration</div>
            <div className="text-xs text-muted-foreground">
              {profile.config.calibration
                ? `Defects are reported in millimetres and inches (1 pixel = ${profile.config.calibration.mm_per_pixel.toPrecision(3)} mm on a ${profile.config.calibration.image_long_side} px photo).`
                : "Not calibrated: defect sizes are shown in pixels."}
            </div>
          </div>
          <Badge variant={profile.config.calibration ? "pass" : "warn"} dot>
            {profile.config.calibration ? "Calibrated" : "Not calibrated"}
          </Badge>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/profiles/${profile.id}/calibration`}>{profile.config.calibration ? "Recalibrate" : "Calibrate sizes"}</Link>
          </Button>
        </div>

        {report.warnings.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-3 text-[12.5px] text-warning" aria-label="Warnings">
            {report.warnings.map((w) => (
              <li key={w} className="flex gap-2"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{w}</li>
            ))}
          </ul>
        )}

        {engineering && (
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Good-sample scores</h3>
            <ScoreHistogram report={report} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
