import { ArrowLeft, Download, Loader2, RotateCcw, Ruler, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useCalibrateMarker, useCalibrateRuler, useClearCalibration, useProfiles } from "@/api/hooks";
import type { ProfileOut } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dropzone } from "@/features/inspect/Dropzone";
import { DEFAULT_MARKER_MM, markerPdfUrl, MAX_MARKER_MM, MIN_MARKER_MM, parseMarkerSide } from "./markerPdf";
import { clickToImage, nextPoints, pixelDistance, toMm, type LengthUnit, type Point } from "./rulerMath";

/** Object URL for a file, released when the file changes. */
function usePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url;
}

function image(file: File | undefined | null): File | null {
  return file && file.type.startsWith("image/") ? file : null;
}

function Status({ profile }: { profile: ProfileOut }) {
  const clear = useClearCalibration(profile.id);
  const cal = profile.config.calibration;
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-wrap items-center gap-3">
        {cal ? (
          <>
            <Badge variant="pass" dot>
              Calibrated
            </Badge>
            <span className="num text-sm">{cal.mm_per_pixel.toPrecision(4)} mm per pixel</span>
            <span className="text-xs text-muted-foreground">
              from {cal.source === "marker" ? "a printed marker" : "a ruler"} ({cal.reference_mm.toPrecision(4).replace(/\.?0+$/, "")} mm) on a photo {cal.image_long_side} px wide
            </span>
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground hover:text-destructive" disabled={clear.isPending} onClick={() => clear.mutate(undefined, { onSuccess: () => toast.success("Calibration removed") })}>
              <Trash2 />
              Remove
            </Button>
          </>
        ) : (
          <>
            <Badge variant="warn" dot>
              Not calibrated
            </Badge>
            <span className="text-sm text-muted-foreground">Defect sizes are shown in pixels until you calibrate.</span>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PrintMarker({ side, onSide }: { side: string; onSide: (v: string) => void }) {
  const valid = parseMarkerSide(side);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>1. Print the marker</CardTitle>
        <CardDescription>A square marker with its exact size printed on the page. Print it at 100% (Actual size).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium">Side of the black square (mm)</span>
          <Input inputMode="decimal" value={side} onChange={(e) => onSide(e.target.value)} aria-invalid={valid === null} aria-label="Marker side in millimetres" className="num" />
          <span className={valid === null ? "text-[11px] text-destructive" : "text-[11px] text-muted-foreground"}>
            {MIN_MARKER_MM} to {MAX_MARKER_MM} mm. Bigger is easier to find from far away.
          </span>
        </label>
        {valid !== null ? (
          <Button asChild>
            <a href={markerPdfUrl(valid)} download>
              <Download />
              Download marker PDF
            </a>
          </Button>
        ) : (
          <Button disabled>
            <Download />
            Download marker PDF
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MarkerTab({ profile, side }: { profile: ProfileOut; side: string }) {
  const [file, setFile] = useState<File | null>(null);
  const preview = usePreview(file);
  const calibrate = useCalibrateMarker(profile.id);
  const sideMm = parseMarkerSide(side);
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">Put the printed marker flat in the picture, at the same height as the fabric, then take a photo or add one you have.</p>
      {preview ? <img src={preview} alt="Photo with the marker" className="max-h-80 rounded-lg border object-contain" /> : <Dropzone onFile={(f) => setFile(image(f))} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!file || sideMm === null || calibrate.isPending}
          onClick={() =>
            file &&
            sideMm !== null &&
            calibrate.mutate(
              { image: file, sideMm },
              { onSuccess: (out) => toast.success("Calibrated", { description: `${out.detail}. 1 pixel = ${out.mm_per_pixel.toPrecision(4)} mm.` }) },
            )
          }
        >
          {calibrate.isPending ? <Loader2 className="animate-spin" /> : <Ruler />}
          Calibrate from marker
        </Button>
        {file && (
          <Button variant="ghost" onClick={() => setFile(null)}>
            <RotateCcw />
            Choose another photo
          </Button>
        )}
        {sideMm === null && <span className="text-xs text-destructive">Enter the printed size in step 1 first.</span>}
      </div>
    </div>
  );
}

const UNITS: { value: LengthUnit; label: string }[] = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "in", label: "in" },
];

function RulerTab({ profile }: { profile: ProfileOut }) {
  const [file, setFile] = useState<File | null>(null);
  const preview = usePreview(file);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState<LengthUnit>("mm");
  const calibrate = useCalibrateRuler(profile.id);
  const distanceMm = toMm(distance, unit);
  const ready = natural !== null && points.length === 2 && distanceMm !== null;

  const reset = () => {
    setFile(null);
    setNatural(null);
    setPoints([]);
  };

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">Lay a ruler (or anything of known length) in the picture. Click one end, then the other, and enter the distance between them.</p>
      {preview ? (
        <div className="relative inline-block max-w-full select-none">
          <img
            src={preview}
            alt="Photo with a ruler. Click the two ends."
            className="max-h-[28rem] max-w-full cursor-crosshair rounded-lg border object-contain"
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onClick={(e) => {
              if (!natural) return;
              const clicked = clickToImage(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), natural.w, natural.h); // read the event now: it is cleared before a state updater runs
              setPoints((p) => nextPoints(p, clicked));
            }}
            draggable={false}
          />
          {natural && points.length === 2 && (
            <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${natural.w} ${natural.h}`} preserveAspectRatio="none" aria-hidden>
              <line x1={points[0]!.x} y1={points[0]!.y} x2={points[1]!.x} y2={points[1]!.y} stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {natural &&
            points.map((p, i) => (
              <span
                key={i}
                aria-hidden
                className="pointer-events-none absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-primary bg-background/80 text-[10px] font-semibold text-primary"
                style={{ left: `${(p.x / natural.w) * 100}%`, top: `${(p.y / natural.h) * 100}%` }}
              >
                {i + 1}
              </span>
            ))}
        </div>
      ) : (
        <Dropzone onFile={(f) => setFile(image(f))} />
      )}

      {file && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium">Real distance between the two points</span>
            <Input inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="e.g. 200" aria-label="Real distance" className="num w-36" />
          </label>
          <Segmented label="Unit" value={unit} onChange={setUnit} options={UNITS} />
          <span className="num text-xs text-muted-foreground">
            {points.length === 2 ? `${pixelDistance(points[0]!, points[1]!).toFixed(1)} px between the points` : `${points.length} of 2 points picked`}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!ready || calibrate.isPending}
          onClick={() =>
            ready &&
            calibrate.mutate(
              { imageWidth: natural.w, imageHeight: natural.h, p1: points[0]!, p2: points[1]!, distanceMm },
              { onSuccess: (out) => toast.success("Calibrated", { description: `${out.detail}. 1 pixel = ${out.mm_per_pixel.toPrecision(4)} mm.` }) },
            )
          }
        >
          {calibrate.isPending ? <Loader2 className="animate-spin" /> : <Ruler />}
          Calibrate from ruler
        </Button>
        {points.length > 0 && (
          <Button variant="ghost" onClick={() => setPoints([])}>
            <RotateCcw />
            Pick the points again
          </Button>
        )}
        {file && (
          <Button variant="ghost" onClick={reset}>
            Choose another photo
          </Button>
        )}
      </div>
    </div>
  );
}

/** Teach a profile how big one pixel is, with a printed marker or a ruler. */
export function CalibrationPage() {
  const { id } = useParams();
  const profileId = Number(id);
  const { data: profiles, isPending } = useProfiles();
  const profile = profiles?.find((p) => p.id === profileId);
  const [side, setSide] = useState(String(DEFAULT_MARKER_MM));

  const back = (
    <Button variant="outline" size="sm" asChild>
      <Link to="/profiles">
        <ArrowLeft />
        Profiles
      </Link>
    </Button>
  );

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading calibration">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!profile) {
    return (
      <Card>
        <CardContent>
          <EmptyState illustration="profile" title="That profile does not exist" description="It may have been deleted. Pick a profile from the list." action={back} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Ruler}
        title="Size calibration"
        description={`Teach TexScan how big a pixel is for "${profile.name}", so defects are reported in millimetres and inches.`}
        actions={back}
      />
      <Status profile={profile} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <PrintMarker side={side} onSide={setSide} />
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>2. Calibrate</CardTitle>
            <CardDescription>Use the printed marker, or a ruler. Keep the camera where it will be for inspection: moving it or zooming changes the scale.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="marker">
              <TabsList aria-label="Calibration method">
                <TabsTrigger value="marker">Printed marker</TabsTrigger>
                <TabsTrigger value="ruler">Ruler</TabsTrigger>
              </TabsList>
              <TabsContent value="marker">
                <MarkerTab profile={profile} side={side} />
              </TabsContent>
              <TabsContent value="ruler">
                <RulerTab profile={profile} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
