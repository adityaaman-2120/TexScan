import { FileImage, RotateCcw, TriangleAlert } from "lucide-react";
import { useId, useRef } from "react";
import { ProfileSelector } from "@/app/ProfileSelector";
import { METHOD_LABELS, type Method } from "@/api/types";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { BitPlanes } from "./BitPlanes";
import { Dropzone } from "./Dropzone";
import { effectiveValue, sliderDefs, toOdd } from "./config";
import { SampleGallery } from "./SampleGallery";
import type { InspectSession } from "./useInspectSession";

const METHOD_HELP: Record<Method, string> = {
  fft: "Removes the repeating weave in the frequency domain; what is left is the defect. Best on periodic textures.",
  gabor: "Compares texture energy at several scales and directions against the image's own typical value.",
  golden_template: "Lines up a known-good reference image with yours and subtracts it.",
  local_statistics: "Flags sliding windows whose mean and variance are outliers for this image.",
};

const ODD_PATHS = new Set(["denoise.ksize", "morphology.kernel_size", "local_stats.window"]);
const SOURCE_METHODS = Object.keys(METHOD_LABELS) as Method[];

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-xs font-medium">{children}</div>
      {hint && <div className="text-[11px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ReferencePicker({ session }: { session: InspectSession }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <Label hint="A known-good image of the same material.">Reference image</Label>
      <input
        id={id}
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          session.setReference(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => input.current?.click()}>
        <FileImage />
        <span className="truncate">{session.reference ? session.reference.name : "Choose reference…"}</span>
      </Button>
      {session.needsReference && (
        <p className="flex items-start gap-2 text-[12px] leading-snug text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          Golden template needs a reference image before it can run.
        </p>
      )}
    </div>
  );
}

export function ControlPanel({ session }: { session: InspectSession }) {
  const { method, overrides, result } = session;
  const defs = sliderDefs(method);
  const edited = Object.keys(overrides).length > 0;

  return (
    <div className="space-y-4">
      {session.file && (
        <Card className="gap-3 p-3 py-3">
          <Dropzone compact onFile={session.acceptFile} />
          <div className="px-1">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Try a sample</div>
            <SampleGallery variant="mini" onPick={session.loadSample} activeId={session.sample?.id} />
          </div>
        </Card>
      )}

      <Card className="gap-4 py-4">
        <div className="space-y-4 px-4">
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => session.setMethod(v as Method)}>
              <SelectTrigger aria-label="Detection method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11.5px] leading-snug text-muted-foreground">{METHOD_HELP[method]}</p>
          </div>

          <div className="space-y-1.5">
            <Label hint="Tuned thresholds from known-good images.">Profile</Label>
            <ProfileSelector className="w-full sm:w-full" />
          </div>

          {method === "golden_template" && <ReferencePicker session={session} />}
        </div>

        <Accordion type="single" collapsible className="border-t px-4">
          <AccordionItem value="advanced">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                Advanced
                {edited && <span className="size-1.5 rounded-full bg-primary" aria-label="edited" />}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-5">
              {defs.map((d) => {
                const value = Number(effectiveValue(d.path, overrides, result?.config));
                return (
                  <div key={d.path} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Label hint={d.hint}>{d.label}</Label>
                      <span className="num shrink-0 text-xs text-primary">
                        {Number.isInteger(value) ? value : value.toFixed(1)}
                        {d.unit && <span className="ml-0.5 text-muted-foreground">{d.unit}</span>}
                      </span>
                    </div>
                    <Slider
                      value={[value]}
                      min={d.min}
                      max={d.max}
                      step={d.step}
                      aria-label={d.label}
                      onValueChange={([v]) => session.setOverride(d.path, ODD_PATHS.has(d.path) ? toOdd(v!) : v!)}
                    />
                  </div>
                );
              })}
              <Button variant="ghost" size="sm" disabled={!edited} onClick={session.resetOverrides} className="w-full">
                <RotateCcw />
                Reset to {session.result ? "profile / defaults" : "defaults"}
              </Button>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Changes re-run the inspection after a short pause. Re-runs of the same image replace each other in History.
              </p>

              <section className="space-y-2 border-t pt-4" aria-labelledby="bitplanes-heading">
                <div>
                  <h3 id="bitplanes-heading" className="text-xs font-medium">
                    Bit planes
                  </h3>
                  <div className="text-[11px] leading-snug text-muted-foreground">The 8 binary layers of the grayscale image.</div>
                </div>
                <BitPlanes inspectionId={result?.id} />
              </section>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
