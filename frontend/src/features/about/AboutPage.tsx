import { ArrowUpRight, CircleCheck, CircleDot } from "lucide-react";
import { Link } from "react-router-dom";
import { requireNav } from "@/app/nav";
import { Stagger, StaggerItem } from "@/components/motion";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd, modKey } from "@/components/ui/kbd";
import { coverageCounts, SYLLABUS, type SyllabusItem } from "./syllabus";

const item = requireNav("/about");

const SHORTCUTS: { keys: string[]; what: string; where: string }[] = [
  { keys: [modKey, "K"], what: "Open the command palette", where: "Anywhere" },
  { keys: [modKey, "B"], what: "Collapse or expand the sidebar", where: "Anywhere" },
  { keys: ["U"], what: "Upload an image", where: "Inspect" },
  { keys: ["X"], what: "Open the pipeline X-Ray", where: "Inspect (after a result)" },
  { keys: [modKey, "V"], what: "Paste an image from the clipboard", where: "Inspect" },
  { keys: ["←", "→"], what: "Previous / next stage", where: "X-Ray" },
];

function TopicCard({ topic }: { topic: SyllabusItem }) {
  const full = topic.coverage === "full";
  return (
    <Card className="h-full gap-3 py-5">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base leading-snug">{topic.topic}</CardTitle>
          <Badge variant={full ? "pass" : "warn"} className="mt-0.5">
            {full ? <CircleCheck /> : <CircleDot />}
            {full ? "Covered" : "Partly"}
          </Badge>
        </div>
        <CardDescription className="leading-relaxed text-foreground/80">{topic.summary}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto space-y-3 text-[13px]">
        {topic.note && <p className="rounded-md border border-warning/25 bg-warning/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{topic.note}</p>}
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">See it</div>
          <Link to={topic.path} className="mt-0.5 inline-flex items-start gap-1 text-primary underline-offset-4 hover:underline">
            <span>{topic.where}</span>
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0" />
          </Link>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Code</div>
          <code className="num break-words text-xs">backend/texscan/{topic.code}</code>
        </div>
      </CardContent>
    </Card>
  );
}

export function AboutPage() {
  const counts = coverageCounts(SYLLABUS);
  return (
    <div>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />

      <Stagger className="space-y-8">
        <StaggerItem>
          <Card className="gap-3 py-5">
            <CardHeader>
              <CardTitle>What TexScan is</CardTitle>
            </CardHeader>
            <CardContent className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                TexScan inspects fabric and other surfaces for defects such as holes, tears, stains and loose threads, using <strong className="text-foreground">classical image processing only</strong>. There is no
                deep learning anywhere: every step is a filter, a transform or a threshold that you can open up in the pipeline X-Ray and follow by hand.
              </p>
              <p>
                An image is converted to grayscale, denoised, contrast-enhanced, passed to one of four detectors (FFT notch, Gabor bank, golden template or local statistics), cleaned up with morphology, and
                its connected regions are measured and classified by simple rules. The page-by-page map below shows where each lab topic appears.
              </p>
              <p className="num text-xs">
                <span className="text-foreground">{counts.full}</span> of {counts.total} syllabus topics fully covered, <span className="text-foreground">{counts.partial}</span> partly (spatial sharpening).
              </p>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <h2 className="mb-3 text-sm font-semibold">Lab syllabus map</h2>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {SYLLABUS.map((topic) => (
              <li key={topic.id} className="min-w-0">
                <TopicCard topic={topic} />
              </li>
            ))}
          </ul>
        </StaggerItem>

        <StaggerItem>
          <Card className="gap-3 py-5">
            <CardHeader>
              <CardTitle>Keyboard shortcuts</CardTitle>
              <CardDescription>Letter shortcuts are off while you are typing in a field or a menu is open.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {SHORTCUTS.map((s) => (
                  <div key={s.what} className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
                    <div className="min-w-0">
                      <dt className="text-sm">{s.what}</dt>
                      <dd className="text-xs text-muted-foreground">{s.where}</dd>
                    </div>
                    <span className="flex shrink-0 items-center gap-1" aria-label={s.keys.join(" plus ")}>
                      {s.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
