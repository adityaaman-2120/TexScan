import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CameraOff, CircleCheck, CircleX, Crosshair, FlipHorizontal2, Loader2, Pause, Play, RefreshCw, Smartphone, SwitchCamera, TriangleAlert, Video, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ProfileSelector } from "@/app/ProfileSelector";
import { fileUrl, postForm } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { keys, useAddCaptures, useProfiles, useRoll } from "@/api/hooks";
import { METHOD_LABELS, type InspectionOut, type Method } from "@/api/types";
import { requireNav } from "@/app/nav";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFECT_LABELS, type DefectKind } from "@/features/inspect/defectLabels";
import { formatMetres, nextPosition } from "@/features/rolls/rollMath";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";
import { captureFullFrame } from "./frames";
import { centerFraction, isStale, placeBox, regionRect, WHOLE_FRAME, type InspectArea } from "./liveMath";
import { useCalibrate } from "./useCalibrate";
import { useCamera } from "./useCamera";
import { useLiveStream } from "./useLiveStream";
import { verdictView, type VerdictKind } from "./verdict";

const item = requireNav("/live");
const METHODS: Method[] = ["fft", "gabor", "local_statistics"]; // golden_template needs a reference image
const SEND_SIDES = [240, 320, 480] as const;
const AREAS: { value: InspectArea; label: string }[] = [
  { value: "center", label: "Middle 60%" },
  { value: "full", label: "Whole picture" },
];
const MAX_BOXES = 80; // a noisy scene can produce hundreds of regions; draw the biggest

const TONE: Record<VerdictKind, string> = {
  pass: "border-success/50 bg-success/10 text-success shadow-[0_0_44px_-10px_var(--success)]",
  fail: "border-destructive/50 bg-destructive/10 text-destructive shadow-[0_0_44px_-10px_var(--destructive)]",
  paused: "border-warning/50 bg-warning/10 text-warning",
  connecting: "border-primary/40 bg-primary/10 text-primary",
  waiting: "border-border bg-muted/40 text-muted-foreground",
  offline: "border-destructive/40 bg-destructive/10 text-destructive",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  off: "border-border bg-muted/40 text-muted-foreground",
};

function Readout({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num mt-0.5 truncate text-lg font-semibold">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

export function LivePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const camera = useCamera(videoRef);
  const profileId = useUi((s) => s.profileId);
  const engineering = useUi((s) => s.engineering);
  const setProfileId = useUi((s) => s.setProfileId);
  const { data: profiles } = useProfiles();
  const profile = profiles?.find((p) => p.id === profileId);

  const [paused, setPaused] = useState(false);
  const [methodChoice, setMethodChoice] = useState<Method>("gabor"); // real cloth is rarely periodic, so FFT is a poor default for a camera
  const [sendSide, setSendSide] = useState<(typeof SEND_SIDES)[number]>(320);
  const [area, setArea] = useState<InspectArea>("center");
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [mirrorPref, setMirrorPref] = useState<"auto" | "on" | "off">("auto");
  const [capturing, setCapturing] = useState(false);
  const [lastCapture, setLastCapture] = useState<InspectionOut | null>(null);
  // roll mode (/live?roll=ID&at=M): a capture becomes a picture of that roll at the metre mark typed here
  const [params] = useSearchParams();
  const rollId = Number(params.get("roll")) || undefined;
  const { data: roll } = useRoll(rollId);
  const addToRoll = useAddCaptures(rollId ?? 0);
  const [mark, setMark] = useState(params.get("at") ?? "0");
  const [now, setNow] = useState(() => performance.now());

  const cam = camera.state.status === "ready" ? camera.state : null;
  const ready = cam !== null;
  const method = (profile?.method as Method | undefined) ?? methodChoice; // a profile is tuned for one method
  const center = centerFraction(area);
  const live = useLiveStream({ enabled: ready, paused, videoRef, method, profileId, sendSide, center });
  const calibration = useCalibrate({ videoRef, sendSide, method, center });
  const { result, resultAt } = live;

  const mirror = mirrorPref === "on" || (mirrorPref === "auto" && cam?.facing === "user");
  const stale = isStale(resultAt, now);

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 500);
    return () => clearInterval(id);
  }, []);

  // the stage takes the shape of the frame the browser really decodes (a phone relayed as a webcam can differ from what the track reports)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) {
      setFrame(null);
      return;
    }
    const sync = () => setFrame(video.videoWidth > 0 ? { w: video.videoWidth, h: video.videoHeight } : null);
    sync();
    video.addEventListener("loadedmetadata", sync);
    video.addEventListener("resize", sync);
    return () => {
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("resize", sync);
    };
  }, [ready]);

  // pausing freezes the picture as well, so a capture grabs exactly what is on screen
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (paused) video.pause();
    else void video.play().catch(() => undefined);
  }, [paused, ready]);

  useEffect(() => {
    if (!ready) setPaused(false);
  }, [ready]);

  const verdict = verdictView({ cameraReady: ready, paused, status: live.status, decision: result?.decision ?? null, stale, defectCount: result?.defect_count ?? 0, serverMessage: live.serverMessage });

  // announce only when the verdict changes, not on every frame
  const announced = useMemo(() => (verdict.kind === "pass" || verdict.kind === "fail" ? `Verdict: ${verdict.label}. ${verdict.detail}` : `${verdict.label}.`), [verdict.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- defect boxes over the video -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = overlayRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = stage;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!result || (stale && !paused)) return;
      const region = regionRect(result.region ?? WHOLE_FRAME, { w, h });
      if (region.w < w - 1 || region.h < h - 1) {
        // dim everything the server did not look at (black bars, the outer part of the picture) and outline what it did
        const gx = mirror ? w - region.x - region.w : region.x;
        ctx.fillStyle = "rgba(0,0,0,0.38)";
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.rect(gx, region.y, region.w, region.h);
        ctx.fill("evenodd");
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "rgba(34,211,238,0.9)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(gx + 0.5, region.y + 0.5, region.w - 1, region.h - 1);
        ctx.setLineDash([]);
      }
      if (result.defects.length === 0) return;
      const boxes = [...result.defects].sort((a, b) => b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3]).slice(0, MAX_BOXES);
      ctx.lineWidth = 2;
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      ctx.textBaseline = "top";
      boxes.forEach((d, i) => {
        const r = placeBox(d.bbox, { w: result.width, h: result.height }, region, w, mirror);
        ctx.strokeStyle = "#ef4444";
        ctx.shadowColor = "rgba(239,68,68,0.6)";
        ctx.shadowBlur = 6;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.shadowBlur = 0;
        if (i < 6 && d.defect_type) {
          const label = `${DEFECT_LABELS[(d.defect_type as DefectKind) ?? "unknown"] ?? d.defect_type}${d.type_confidence != null ? ` ${Math.round(d.type_confidence * 100)}%` : ""}`;
          const tw = ctx.measureText(label).width + 8;
          const ly = r.y >= 18 ? r.y - 18 : r.y + r.h + 2;
          ctx.fillStyle = "rgba(0,0,0,0.72)";
          ctx.fillRect(r.x, ly, tw, 16);
          ctx.fillStyle = "#fff";
          ctx.fillText(label, r.x + 4, ly + 3);
        }
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [result, stale, paused, mirror]);

  // ---- capture: the current full-resolution frame becomes a stored inspection ------------------------------
  const capture = async () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    setCapturing(true);
    try {
      const file = await captureFullFrame(video);
      if (rollId !== undefined) {
        const position = Number(mark.replace(",", "."));
        if (!Number.isFinite(position) || position < 0) throw new Error("Enter the metre mark of the picture's top edge first.");
        const res = await addToRoll.mutateAsync({ files: [file], positions: [position], config: { trim_borders: true, center_fraction: center } }); // same view as live
        setMark(String(nextPosition(res.roll.captures, res.roll.length_m)));
        toast.success(`Added to roll ${res.roll.code} at ${formatMetres(position)}`, {
          description: `${res.roll.summary.total_points} points so far, ${res.roll.summary.points_per_100_sq_yd.toFixed(1)} per 100 sq yd.`,
          action: { label: "Open roll", onClick: () => navigate(`/roll/${res.roll.id}`) },
        });
        return;
      }
      const form = new FormData();
      form.append("image", file);
      form.append("method", method);
      form.append("config", JSON.stringify({ trim_borders: true, center_fraction: center })); // the same view as live, so the verdicts agree
      if (profileId !== null) form.append("profile_id", String(profileId));
      const out = await postForm<InspectionOut>("/inspect", form);
      setLastCapture(out);
      void queryClient.invalidateQueries({ queryKey: ["inspections"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`Saved inspection #${out.id}: ${out.decision}`, {
        description: `${out.defects.length} defect${out.defects.length === 1 ? "" : "s"} in the captured frame.`,
        action: { label: "Open", onClick: () => navigate(`/history?id=${out.id}`) },
      });
    } catch (e) {
      toast.error("Capture failed", { description: errorMessage(e) });
    } finally {
      setCapturing(false);
    }
  };

  // ---- calibrate: tune a profile on a few frames of good cloth ---------------------------------------------
  const calibrate = async () => {
    try {
      const made = await calibration.run();
      await queryClient.invalidateQueries({ queryKey: keys.profiles }); // the profile list must know the new profile first, or the selector resets it
      setProfileId(made.id);
      toast.success("Calibrated", { description: `Learned from ${calibration.total} frames. "${made.name}" is now the active profile.` });
    } catch (e) {
      toast.error("Calibration failed", { description: errorMessage(e) });
    }
  };

  const failure = camera.state.status === "failed" ? camera.state.failure : null;
  const ratio = frame ? `${frame.w} / ${frame.h}` : cam ? `${cam.width} / ${cam.height}` : "16 / 9";
  const deviceId = cam?.deviceId ?? null;
  const multiple = camera.devices.length > 1;
  const flip = () => {
    if (!multiple) return;
    const i = camera.devices.findIndex((d) => d.deviceId === deviceId);
    void camera.start(camera.devices[(i + 1) % camera.devices.length]!.deviceId);
  };
  const live_ok = live.status === "live";

  return (
    <>
      <PageHeader icon={item.icon} title={item.label} description={item.description} />
      <p className="sr-only" role="status" aria-live="polite">{announced}</p>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {rollId !== undefined && (
            <Card className="py-3">
              <CardContent className="flex flex-wrap items-center gap-3 text-sm">
                <span>
                  Capturing for roll <strong className="num">{roll?.code ?? `#${rollId}`}</strong>
                </span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Metre mark of the top edge
                  <Input inputMode="decimal" value={mark} onChange={(e) => setMark(e.target.value)} aria-label="Metre mark of the picture's top edge" className="num h-8 w-24" />
                  m
                </label>
                <span className="text-xs text-muted-foreground">Uses the roll&apos;s profile{roll?.profile_name ? ` (${roll.profile_name})` : ""}.</span>
                <Button variant="outline" size="sm" className="ml-auto" asChild>
                  <Link to={`/roll/${rollId}`}>Back to the roll</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* verdict + readouts */}
          <Card className="py-4">
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={verdict.kind}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  className={cn("flex h-24 min-w-52 shrink-0 flex-col items-center justify-center rounded-xl border-2 px-4 text-center", TONE[verdict.kind])}
                >
                  <span className="flex items-center gap-2.5 font-mono text-4xl font-bold tracking-widest">
                    {verdict.kind === "pass" && <CircleCheck className="size-8" />}
                    {verdict.kind === "fail" && <CircleX className="size-8" />}
                    {verdict.kind === "paused" && <Pause className="size-7" />}
                    {verdict.kind === "connecting" && <Loader2 className="size-7 animate-spin" />}
                    {(verdict.kind === "offline" || verdict.kind === "error") && <WifiOff className="size-7" />}
                    {verdict.kind === "off" && <CameraOff className="size-7" />}
                    <span className={verdict.label.length > 8 ? "text-2xl" : ""}>{verdict.label}</span>
                  </span>
                  <span className="mt-1 text-[11.5px] leading-tight opacity-90">{verdict.detail}</span>
                </motion.div>
              </AnimatePresence>

              <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <Readout label="Frame rate" value={live_ok && !paused ? live.stats.fps.toFixed(1) : "—"} unit="fps" hint="Results per second (the server handles at most 5)." />
                <Readout label="Latency" value={live.stats.latencyMs == null ? "—" : String(Math.round(live.stats.latencyMs))} unit="ms" hint="From sending a frame to getting its result back." />
                <Readout label="Server time" value={live.stats.processMs == null ? "—" : String(Math.round(live.stats.processMs))} unit="ms" hint="Time the server took to check the frame." />
                <Readout label="Defect area" value={result && !stale ? result.defect_area_percent.toFixed(2) : "—"} unit="%" />
              </div>
            </CardContent>
          </Card>

          {ready && !profile && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground" role="note">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                Not calibrated yet. General settings often call real cloth defective. Fill the dashed box with good, defect-free cloth and press <strong className="text-foreground">Calibrate</strong>; move the cloth a little while it takes {calibration.total} frames.
              </span>
            </p>
          )}

          {/* the picture */}
          <div
            ref={stageRef}
            className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-xl border bg-black"
            style={{ aspectRatio: ratio }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={cn("absolute inset-0 size-full object-fill", mirror && "-scale-x-100", !ready && "invisible")}
              aria-label="Live camera preview"
            />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />

            {ready && (
              <div className={cn("absolute left-3 top-3 flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm font-bold backdrop-blur", TONE[verdict.kind], "bg-background/80")}>
                {verdict.label}
              </div>
            )}
            {ready && (
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-[11px] backdrop-blur">
                <span className={cn("size-2 rounded-full", paused ? "bg-warning" : live_ok ? "animate-pulse bg-destructive" : "bg-muted-foreground")} aria-hidden />
                {paused ? "paused" : live_ok ? "live" : live.status}
              </div>
            )}

            {camera.state.status === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-card/90 p-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary"><Video className="size-7" /></div>
                <div>
                  <p className="text-base font-semibold">Inspect from your camera, live</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Frames are downscaled in your browser and sent to your own TexScan server. Nothing leaves your network.</p>
                </div>
                <Button size="lg" onClick={() => void camera.start()}><Camera />Start camera</Button>
              </div>
            )}
            {camera.state.status === "starting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card/90 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-6 animate-spin text-primary" />Waiting for the camera… allow access if your browser asks.
              </div>
            )}
            {failure && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-card/95 p-6 text-center" role="alert">
                <TriangleAlert className="size-8 text-warning" />
                <p className="text-base font-semibold">{failure.title}</p>
                <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">{failure.help}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {failure.problem !== "insecure" && failure.problem !== "unsupported" && <Button onClick={() => void camera.start()}><RefreshCw />Try again</Button>}
                  <Button variant="outline" asChild><Link to="/inspect">Inspect a photo instead</Link></Button>
                </div>
              </div>
            )}
          </div>

          {/* controls */}
          <div className="flex flex-wrap items-center gap-2">
            {!ready ? (
              <Button onClick={() => void camera.start()} disabled={camera.state.status === "starting"}><Camera />Start camera</Button>
            ) : (
              <>
                <Button variant={paused ? "default" : "outline"} onClick={() => setPaused(!paused)}>{paused ? <Play /> : <Pause />}{paused ? "Resume" : "Pause"}</Button>
                <Button onClick={() => void capture()} disabled={capturing} className="min-w-36">
                  {capturing ? <Loader2 className="animate-spin" /> : <Camera />}
                  {capturing ? "Saving…" : rollId !== undefined ? "Capture to roll" : "Capture"}
                </Button>
                <Button variant="outline" onClick={() => void calibrate()} disabled={calibration.running || paused} title="Learn what good cloth looks like on this camera, then judge against that">
                  {calibration.running ? <Loader2 className="animate-spin" /> : <Crosshair />}
                  {calibration.running ? `Calibrating ${calibration.taken}/${calibration.total}` : "Calibrate"}
                </Button>
                {multiple && <Button variant="outline" size="icon" aria-label="Switch camera" title="Switch camera" onClick={flip}><SwitchCamera /></Button>}
                <Button variant="ghost" onClick={() => { camera.stop(); setPaused(false); }}><CameraOff />Stop camera</Button>
                {live.status === "offline" && <Button variant="outline" onClick={live.reconnect}><RefreshCw />Reconnect</Button>}
              </>
            )}
            <span className="ml-auto text-xs text-muted-foreground">Capture saves the current frame at full resolution as a normal inspection, judged with the same settings.</span>
          </div>

          {lastCapture && (
            <Card className="py-3">
              <CardContent className="flex items-center gap-4">
                <img src={fileUrl(lastCapture.stage_urls.overlay!)} alt="Last capture with defects outlined" className="size-16 shrink-0 rounded-md border object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Saved as inspection #{lastCapture.id}</div>
                  <div className="num text-xs text-muted-foreground">{lastCapture.decision} · {lastCapture.defects.length} defects · {Math.round(lastCapture.metrics.total_ms)} ms</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/history?id=${lastCapture.id}`)}>Open</Button>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="gap-4 py-4">
            <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {engineering && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Method</div>
                  <Select value={method} onValueChange={(v) => setMethodChoice(v as Method)} disabled={Boolean(profile)}>
                    <SelectTrigger aria-label="Detection method"><SelectValue /></SelectTrigger>
                    <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>)}</SelectContent>
                  </Select>
                  {profile && <p className="text-[11px] text-muted-foreground">Fixed by the active profile ({profile.name}).</p>}
                </div>
              )}
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Profile</div>
                <ProfileSelector className="w-full sm:w-full" />
                <p className="text-[11px] leading-snug text-muted-foreground">{engineering ? `A profile sets the thresholds and working size; without one, live mode works at ${sendSide} px.` : "A profile holds the settings learned for one fabric. Without one, general settings are used."}</p>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Inspect area</div>
                <Segmented label="Inspect area" value={area} onChange={setArea} options={AREAS} />
                <p className="text-[11px] leading-snug text-muted-foreground">Black bars are always skipped. The middle option also ignores the outer part of the picture, where the edge of the cloth would be flagged.</p>
              </div>
              {engineering && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Working size</div>
                  <Segmented label="Frame size" value={String(sendSide)} onChange={(v) => setSendSide(Number(v) as (typeof SEND_SIDES)[number])} options={SEND_SIDES.map((s) => ({ value: String(s), label: `${s} px` }))} />
                  <p className="text-[11px] leading-snug text-muted-foreground">How big the inspected picture is for the pipeline. Smaller is faster; larger sees finer defects.</p>
                </div>
              )}
              {camera.devices.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Camera</div>
                  <Select value={deviceId ?? undefined} onValueChange={(id) => void camera.start(id)} disabled={!ready}>
                    <SelectTrigger aria-label="Camera"><SelectValue placeholder="Default camera" /></SelectTrigger>
                    <SelectContent>{camera.devices.map((d, i) => <SelectItem key={d.deviceId || i} value={d.deviceId || String(i)}>{d.label || `Camera ${i + 1}`}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium"><FlipHorizontal2 className="size-3.5" />Mirror preview</div>
                <Segmented label="Mirror preview" value={mirrorPref} onChange={setMirrorPref} options={[{ value: "auto", label: "Auto" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]} />
                <p className="text-[11px] text-muted-foreground">Auto mirrors front cameras only. The overlay follows the picture.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Smartphone className="size-4 text-primary" />Use your phone</CardTitle>
              <CardDescription>
                {typeof window !== "undefined" && window.isSecureContext ? "This page is on a secure connection, so the camera is allowed." : "This page is not secure (HTTP), so the browser blocks the camera."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-1.5 pl-4 text-[12.5px] leading-snug text-muted-foreground marker:text-primary">
                <li>Put the phone and this computer on the same Wi-Fi.</li>
                <li>Start with <code className="num rounded bg-muted px-1 py-0.5 text-[11px]">make dev-lan</code> or <code className="num rounded bg-muted px-1 py-0.5 text-[11px]">.\dev.ps1 -Lan</code>.</li>
                <li>Open the <b>Network</b> https:// address it prints (like https://192.168.1.20:5173) on the phone.</li>
                <li>Accept the one-time certificate warning, then Start camera.</li>
              </ol>
              <p className="mt-2 text-[11px] text-muted-foreground">Details and troubleshooting are in the README.</p>
            </CardContent>
          </Card>

          {result && result.defects.length > 0 && !stale && (
            <Card className="gap-2 py-4">
              <CardHeader><CardTitle>Now detecting</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1 text-xs">
                  {result.defects.slice(0, 6).map((d, i) => (
                    <li key={i} className="flex justify-between gap-2"><span>{DEFECT_LABELS[(d.defect_type as DefectKind) ?? "unknown"] ?? d.defect_type}</span><span className="num text-muted-foreground">{d.type_confidence != null ? `${Math.round(d.type_confidence * 100)}%` : ""}</span></li>
                  ))}
                  {result.defects.length > 6 && <li className="text-muted-foreground">+{result.defects.length - 6} more</li>}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
