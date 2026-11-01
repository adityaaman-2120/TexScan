import { RotateCcw } from "lucide-react";
import { Dropzone } from "@/features/inspect/Dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { cutoffPx, type PresetKind, type PresetResponse } from "./filters";
import type { Resolution, SpectrumStudio } from "./useSpectrumStudio";

function Row({ label, hint, value, children }: { label: string; hint?: string; value?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-medium">{label}</div>
          {hint && <div className="text-[11px] leading-snug text-muted-foreground">{hint}</div>}
        </div>
        {value !== undefined && <span className="num shrink-0 text-xs text-primary">{value}</span>}
      </div>
      {children}
    </div>
  );
}

const KIND_OPTIONS: { value: PresetKind; label: string }[] = [
  { value: "none", label: "Off" },
  { value: "lowpass", label: "Low-pass" },
  { value: "highpass", label: "High-pass" },
  { value: "sharpen", label: "Sharpen" },
];
const RESPONSE_OPTIONS: { value: PresetResponse; label: string }[] = [
  { value: "ideal", label: "Ideal" },
  { value: "butterworth", label: "Butterworth" },
  { value: "gaussian", label: "Gaussian" },
];
const RESOLUTION_OPTIONS: { value: `${Resolution}`; label: string }[] = [
  { value: "256", label: "256" },
  { value: "512", label: "512" },
  { value: "1024", label: "1024" },
];

export function ControlsPanel({ studio }: { studio: SpectrumStudio }) {
  const { preset, setPreset, pairs, enabled, spectrum } = studio;
  const size = spectrum ? Math.min(spectrum.width, spectrum.height) : studio.resolution;
  const cutoff = cutoffPx(preset.cutoffFrac, size);
  const onCount = pairs.filter((p) => enabled.has(p.id)).length;

  return (
    <div className="space-y-4">
      <Card className="gap-3 p-3 py-3">
        <Dropzone compact onFile={studio.acceptFile} />
      </Card>

      <Card className="gap-4 px-4 py-4">
        <Row label="Resolution" hint="Working size in pixels. Changing it clears brush strokes.">
          <Segmented
            label="Resolution"
            value={`${studio.resolution}` as `${Resolution}`}
            onChange={(v) => studio.setResolution(Number(v) as Resolution)}
            options={RESOLUTION_OPTIONS}
          />
        </Row>
      </Card>

      <Card className="gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Periodic peaks</div>
            <div className="num text-[11px] text-muted-foreground">
              {pairs.length === 0 ? "none detected" : `${onCount} of ${pairs.length} pairs rejected`}
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => studio.setAllPairs(true)} disabled={pairs.length === 0 || onCount === pairs.length}>
              All
            </Button>
            <Button variant="ghost" size="sm" onClick={() => studio.setAllPairs(false)} disabled={onCount === 0}>
              None
            </Button>
          </div>
        </div>
        {pairs.length > 0 && (
          <ul className="max-h-52 space-y-1 overflow-y-auto pr-1" aria-label="Detected peak pairs">
            {pairs.map((pair, i) => {
              const on = enabled.has(pair.id);
              return (
                <li key={pair.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => studio.togglePair(pair.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left text-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
                      on ? "border-primary/40 bg-primary/10" : "border-border text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    <span className={cn("size-2.5 shrink-0 rounded-full border", on ? "border-primary bg-primary" : "border-muted-foreground")} aria-hidden />
                    <span className="num text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <span className="num">
                      Δ({pair.dx}, {pair.dy})
                    </span>
                    <span className="num ml-auto">≈ {pair.period.toFixed(pair.period < 10 ? 1 : 0)} px</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pairs.length > 0 && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            If a defect breaks into pieces, switch off peaks that are not part of the regular pattern: a defect has a spectrum of its own.
          </p>
        )}
        <Row label="Peak notch radius" hint="Size of the disc rejected around each peak." value={`${studio.peakRadius}px`}>
          <Slider value={[studio.peakRadius]} min={2} max={16} step={1} aria-label="Peak notch radius" onValueChange={([v]) => studio.setPeakRadius(v!)} />
        </Row>
      </Card>

      <Card className="gap-4 px-4 py-4">
        <div>
          <div className="text-sm font-medium">Low / high-pass presets</div>
          <div className="text-[11px] text-muted-foreground">Smooth or sharpen by keeping only some frequencies.</div>
        </div>
        <Segmented label="Filter type" value={preset.kind} onChange={(kind) => setPreset({ ...preset, kind })} options={KIND_OPTIONS} className="w-full [&>button]:flex-1" />
        {preset.kind !== "none" && (
          <>
            <Segmented label="Filter shape" value={preset.response} onChange={(response) => setPreset({ ...preset, response })} options={RESPONSE_OPTIONS} className="w-full [&>button]:flex-1" />
            <Row label="Cutoff" hint="Distance from the centre of the spectrum." value={`${cutoff.toFixed(0)}px`}>
              <Slider value={[preset.cutoffFrac * 100]} min={1} max={100} step={1} aria-label="Cutoff" onValueChange={([v]) => setPreset({ ...preset, cutoffFrac: v! / 100 })} />
            </Row>
            {preset.response === "butterworth" && (
              <Row label="Order" hint="Higher is a steeper edge, closer to ideal." value={preset.order}>
                <Slider value={[preset.order]} min={1} max={8} step={1} aria-label="Butterworth order" onValueChange={([v]) => setPreset({ ...preset, order: v! })} />
              </Row>
            )}
          </>
        )}
      </Card>

      <Button variant="outline" size="sm" className="w-full" onClick={studio.resetAll}>
        <RotateCcw />
        Reset everything
      </Button>
    </div>
  );
}
