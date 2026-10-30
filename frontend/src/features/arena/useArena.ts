import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fileUrl, isAbort, postForm } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { ArenaOut, MvtecSample } from "@/api/types";
import type { SampleImage } from "@/features/inspect/samples";
import { fetchFile } from "@/lib/files";

export type WorkingSize = 512 | 1024;
const DEBOUNCE_MS = 250;

/** Object URL for a File, revoked when the file changes or the page unmounts. */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

/**
 * Inputs and results of the Method Arena. Whenever the image, ground truth, reference or size change,
 * all four methods are re-run after a short pause; a newer run cancels an older one.
 */
export function useArena() {
  const [image, setImageState] = useState<File | null>(null);
  const [groundTruth, setGroundTruth] = useState<File | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [size, setSize] = useState<WorkingSize>(512);
  const [result, setResult] = useState<ArenaOut | null>(null);
  const [running, setRunning] = useState(false);

  const imageUrl = useObjectUrl(image);
  const gtUrl = useObjectUrl(groundTruth);
  const referenceUrl = useObjectUrl(reference);
  const seq = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!image) return;
    const timer = setTimeout(async () => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const id = ++seq.current;
      setRunning(true);
      const form = new FormData();
      form.append("image", image);
      if (groundTruth) form.append("ground_truth", groundTruth);
      if (reference) form.append("reference", reference);
      form.append("config", JSON.stringify({ max_side: size }));
      try {
        const out = await postForm<ArenaOut>("/arena", form, ctrl.signal);
        if (id === seq.current) setResult(out);
      } catch (e) {
        if (!isAbort(e) && id === seq.current) toast.error("Comparison failed", { id: "arena", description: errorMessage(e) });
      } finally {
        if (id === seq.current) setRunning(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [image, groundTruth, reference, size]);

  useEffect(
    () => () => {
      seq.current += 1;
      controller.current?.abort();
    },
    [],
  );

  const setImage = useCallback((file: File | null) => {
    setImageState(file);
    setLabel(file?.name ?? null);
    setGroundTruth(null);
    setReference(null);
    setResult(null);
  }, []);

  /** Load files together so the arena runs once with all of them. */
  const loadSet = useCallback((name: string, parts: { image: File; mask?: File | null; reference?: File | null }) => {
    setImageState(parts.image);
    setGroundTruth(parts.mask ?? null);
    setReference(parts.reference ?? null);
    setLabel(name);
    setResult(null);
  }, []);

  const fail = (e: unknown) => toast.error("Could not load the sample", { description: errorMessage(e) });

  const loadSample = useCallback(
    (s: SampleImage) => {
      Promise.all([fetchFile(s.url), fetchFile(s.mask), fetchFile(s.reference)])
        .then(([img, mask, ref]) => loadSet(s.title, { image: img, mask, reference: ref }))
        .catch(fail);
    },
    [loadSet],
  );

  const loadMvtec = useCallback(
    (s: MvtecSample) => {
      const base = `/datasets/mvtec`;
      const path = `${s.category}/${s.defect_type}/${s.name}`;
      Promise.all([
        fetchFile(fileUrl(`${base}/files/${path}`)),
        s.has_mask ? fetchFile(fileUrl(`${base}/masks/${path}`)) : Promise.resolve(null),
        fetchFile(fileUrl(`${base}/reference/${s.category}`)).catch(() => null),
      ])
        .then(([img, mask, ref]) => loadSet(`${s.category} / ${s.defect_type} / ${s.name}`, { image: img, mask, reference: ref }))
        .catch(fail);
    },
    [loadSet],
  );

  return { image, imageUrl, groundTruth, gtUrl, reference, referenceUrl, label, size, setSize, result, running, setImage, setGroundTruth, setReference, loadSample, loadMvtec };
}

export type ArenaState = ReturnType<typeof useArena>;
