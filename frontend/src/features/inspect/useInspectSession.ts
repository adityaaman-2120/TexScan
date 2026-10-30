import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { client, postForm } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { InspectionOut, Method } from "@/api/types";
import { fetchFile } from "@/lib/files";
import { useUi } from "@/store/ui";
import { toConfig, type Overrides } from "./config";
import type { SampleImage } from "./samples";

const DEBOUNCE_MS = 350;

/**
 * Everything the Inspect page needs: the chosen image, method and overrides, and the latest result.
 *
 * Any change re-runs the pipeline after a short debounce. Out-of-order responses are discarded, and a tuning re-run
 * of the same image replaces the previous run in History, so dragging a slider does not leave dozens of rows behind.
 */
export function useInspectSession() {
  const queryClient = useQueryClient();
  const profileId = useUi((s) => s.profileId);

  const [file, setFile] = useState<File | null>(null);
  const [sample, setSample] = useState<SampleImage | null>(null);
  const [method, setMethodState] = useState<Method>("fft");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [reference, setReference] = useState<File | null>(null);
  const [result, setResult] = useState<InspectionOut | null>(null);
  const [running, setRunning] = useState(false);

  const seq = useRef(0);
  const lastId = useRef<number | null>(null);
  const immediate = useRef(true);

  const needsReference = method === "golden_template" && !reference;

  // a sample brings its own reference image; fetch it when the golden-template method needs one
  useEffect(() => {
    if (method === "golden_template" && !reference && sample) {
      let alive = true;
      fetchFile(sample.reference)
        .then((f) => alive && setReference(f))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }
  }, [method, reference, sample]);

  const loadFile = useCallback((next: File, from: SampleImage | null = null) => {
    immediate.current = true;
    lastId.current = null; // the previous image's final result stays in History
    seq.current += 1;
    setFile(next);
    setSample(from);
    setResult(null);
    setReference(null);
    if (from) {
      setMethodState(from.method);
      setOverrides({});
    }
  }, []);

  const loadSample = useCallback(
    (s: SampleImage) => {
      fetchFile(s.url).then((f) => loadFile(f, s)).catch((e) => toast.error("Could not load the sample", { description: errorMessage(e) }));
    },
    [loadFile],
  );

  const setMethod = useCallback((m: Method) => {
    setMethodState(m);
    setOverrides({}); // thresholds mean different things per method
  }, []);

  const setOverride = useCallback((path: string, value: number | string) => setOverrides((o) => ({ ...o, [path]: value })), []);
  const resetOverrides = useCallback(() => setOverrides({}), []);

  // a different profile has a different baseline, so earlier edits no longer apply
  const firstProfile = useRef(true);
  useEffect(() => {
    if (firstProfile.current) firstProfile.current = false;
    else setOverrides({});
  }, [profileId]);

  const run = useCallback(async () => {
    if (!file) return;
    const id = ++seq.current;
    setRunning(true);
    const form = new FormData();
    form.append("image", file);
    if (reference) form.append("reference", reference);
    if (profileId !== null) form.append("profile_id", String(profileId));
    form.append("method", method);
    if (Object.keys(overrides).length > 0) form.append("config", JSON.stringify(toConfig(overrides)));
    try {
      const out = await postForm<InspectionOut>("/inspect", form);
      if (id !== seq.current) {
        void client.DELETE("/inspections/{inspection_id}", { params: { path: { inspection_id: out.id } } }); // superseded
        return;
      }
      const previous = lastId.current;
      lastId.current = out.id;
      setResult(out);
      if (previous !== null) void client.DELETE("/inspections/{inspection_id}", { params: { path: { inspection_id: previous } } });
      void queryClient.invalidateQueries({ queryKey: ["inspections"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    } catch (e) {
      if (id === seq.current) toast.error("Inspection failed", { id: "inspect-error", description: errorMessage(e) });
    } finally {
      if (id === seq.current) setRunning(false);
    }
  }, [file, reference, profileId, method, overrides, queryClient]);

  useEffect(() => {
    if (!file || needsReference) return;
    const timer = setTimeout(() => void run(), immediate.current ? 0 : DEBOUNCE_MS);
    immediate.current = false;
    return () => clearTimeout(timer);
  }, [file, needsReference, run]);

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
    file, sample, method, setMethod, overrides, setOverride, resetOverrides, reference, setReference, needsReference,
    result, running, loadSample, acceptFile,
  }; // fmt: skip
}

export type InspectSession = ReturnType<typeof useInspectSession>;
