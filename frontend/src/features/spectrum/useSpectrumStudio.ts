import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { isAbort, postForm } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { SpectrumApplyOut, SpectrumOut } from "@/api/types";
import type { SampleImage } from "@/features/inspect/samples";
import { fetchFile } from "@/lib/files";
import { useUi } from "@/store/ui";
import { cutoffPx, DEFAULT_PRESET, pairPeaks, type Preset } from "./filters";
import { canvasToBlob, composeMask, newCanvas } from "./mask";

export type Tool = "select" | "paint" | "erase";
export type Resolution = 256 | 512 | 1024;

/** Soft edges around notches mean less ringing in the residual; scale the skirt with the disc. */
export const featherFor = (peakRadius: number): number => Math.min(20, Math.max(2, Math.round(peakRadius * 1.2)));

const DELAY_MS = 220; // quiet time before a request is sent
const MAX_WAIT_MS = 600; // but never wait longer than this while the user keeps painting

/**
 * State and live-update logic for Spectrum Studio.
 *
 * The reject mask is the enabled peak discs plus the brush layer (an offscreen canvas that lives here, not in React state).
 * Any change schedules a debounced POST /spectrum/apply; a newer request aborts the older one so the picture always matches the controls.
 */
export function useSpectrumStudio() {
  const profileId = useUi((s) => s.profileId);

  const [file, setFile] = useState<File | null>(null);
  const [sample, setSample] = useState<SampleImage | null>(null);
  const [resolution, setResolution] = useState<Resolution>(512);
  const [spectrum, setSpectrum] = useState<SpectrumOut | null>(null);
  const [loadingSpectrum, setLoadingSpectrum] = useState(false);
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(new Set());
  const [tool, setTool] = useState<Tool>("paint");
  const [brushRadius, setBrushRadius] = useState(6);
  const [symmetric, setSymmetric] = useState(true);
  const [peakRadius, setPeakRadius] = useState(5);
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [hasPaint, setHasPaint] = useState(false);
  const [paint, setPaint] = useState<HTMLCanvasElement | null>(null);
  const [result, setResult] = useState<SpectrumApplyOut | null>(null);
  const [applying, setApplying] = useState(false);

  const pairs = useMemo(() => (spectrum ? pairPeaks(spectrum.peaks, spectrum.width, spectrum.height) : []), [spectrum]);

  // ---- 1. spectrum + peaks whenever the image, resolution or profile changes ------------------
  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    let alive = true;
    setSpectrum(null);
    setResult(null);
    setLoadingSpectrum(true);
    const form = new FormData();
    form.append("image", file);
    if (profileId !== null) form.append("profile_id", String(profileId));
    form.append("config", JSON.stringify({ max_side: resolution }));
    postForm<SpectrumOut>("/spectrum", form, controller.signal)
      .then((s) => {
        if (!alive) return;
        setPaint(newCanvas(s.width, s.height)); // a new resolution means new coordinates: brush strokes start over
        setHasPaint(false);
        setEnabled(new Set(pairPeaks(s.peaks, s.width, s.height).map((p) => p.id)));
        setSpectrum(s);
      })
      .catch((e) => {
        if (alive && !isAbort(e)) toast.error("Could not compute the spectrum", { id: "spectrum", description: errorMessage(e) });
      })
      .finally(() => alive && setLoadingSpectrum(false));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [file, resolution, profileId]);

  // ---- 2. live apply ------------------------------------------------------------------------------
  const latest = useRef({ file, spectrum, pairs, enabled, peakRadius, symmetric, preset, resolution, profileId, paint });
  latest.current = { file, spectrum, pairs, enabled, peakRadius, symmetric, preset, resolution, profileId, paint };
  const seq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const firstAt = useRef(0);

  const runApply = useCallback(async () => {
    const L = latest.current;
    if (!L.file || !L.spectrum) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const id = ++seq.current;
    setApplying(true);
    try {
      const { width, height } = L.spectrum;
      const mask = await canvasToBlob(composeMask(width, height, L.paint, L.pairs, L.enabled, L.peakRadius));
      const form = new FormData();
      form.append("image", L.file);
      form.append("mask", mask, "mask.png");
      if (L.profileId !== null) form.append("profile_id", String(L.profileId));
      form.append("config", JSON.stringify({ max_side: L.resolution }));
      form.append("feather", String(featherFor(L.peakRadius)));
      form.append("symmetric", String(L.symmetric));
      form.append("filter_kind", L.preset.kind);
      form.append("filter_response", L.preset.response);
      form.append("cutoff", String(cutoffPx(L.preset.cutoffFrac, Math.min(width, height))));
      form.append("order", String(L.preset.order));
      const out = await postForm<SpectrumApplyOut>("/spectrum/apply", form, controller.signal);
      if (id === seq.current) setResult(out);
    } catch (e) {
      if (!isAbort(e) && id === seq.current) toast.error("Could not apply the filter", { id: "spectrum-apply", description: errorMessage(e) });
    } finally {
      if (id === seq.current) setApplying(false);
    }
  }, []);

  /** Debounce with a maximum wait, so painting a long stroke still updates the result about twice a second. */
  const schedule = useCallback(() => {
    const now = performance.now();
    if (timer.current === undefined) firstAt.current = now;
    window.clearTimeout(timer.current);
    const wait = Math.max(0, Math.min(DELAY_MS, firstAt.current + MAX_WAIT_MS - now));
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      void runApply();
    }, wait);
  }, [runApply]);

  const enabledKey = useMemo(() => [...enabled].sort().join("|"), [enabled]);
  const presetKey = JSON.stringify(preset);
  useEffect(() => {
    if (spectrum) schedule();
  }, [spectrum, enabledKey, peakRadius, symmetric, presetKey, schedule]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      inFlight.current?.abort();
    },
    [],
  );

  // ---- actions -------------------------------------------------------------------------------------
  const notifyPaint = useCallback(() => {
    setHasPaint(true);
    schedule();
  }, [schedule]);

  const clearPaint = useCallback(() => {
    const L = latest.current;
    if (L.paint) L.paint.getContext("2d")!.clearRect(0, 0, L.paint.width, L.paint.height);
    setHasPaint(false);
    schedule();
  }, [schedule]);

  const togglePair = useCallback((id: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const setAllPairs = useCallback((on: boolean) => setEnabled(on ? new Set(latest.current.pairs.map((p) => p.id)) : new Set()), []);

  const resetAll = useCallback(() => {
    const L = latest.current;
    if (L.paint) L.paint.getContext("2d")!.clearRect(0, 0, L.paint.width, L.paint.height);
    setHasPaint(false);
    setEnabled(new Set(L.pairs.map((p) => p.id)));
    setPreset(DEFAULT_PRESET);
    setSymmetric(true);
    schedule();
  }, [schedule]);

  const loadFile = useCallback((next: File, from: SampleImage | null = null) => {
    setFile(next);
    setSample(from);
  }, []);

  const loadSample = useCallback(
    (s: SampleImage) => {
      fetchFile(s.url).then((f) => loadFile(f, s)).catch((e) => toast.error("Could not load the sample", { description: errorMessage(e) }));
    },
    [loadFile],
  );

  const acceptFile = useCallback(
    (candidate: File | undefined | null) => {
      if (!candidate) return;
      if (!candidate.type.startsWith("image/")) {
        toast.error("That is not an image", { description: `${candidate.name || "The file"} is ${candidate.type || "an unknown type"}.` });
        return;
      }
      loadFile(candidate);
    },
    [loadFile],
  );

  return {
    file, sample, resolution, setResolution, spectrum, loadingSpectrum, pairs, enabled, togglePair, setAllPairs,
    tool, setTool, brushRadius, setBrushRadius, symmetric, setSymmetric, peakRadius, setPeakRadius, preset, setPreset,
    paint, hasPaint, notifyPaint, clearPaint, resetAll, result, applying, loadSample, acceptFile,
  }; // fmt: skip
}

export type SpectrumStudio = ReturnType<typeof useSpectrumStudio>;
