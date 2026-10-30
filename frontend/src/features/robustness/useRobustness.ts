import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isAbort, postForm } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { RobustnessOut } from "@/api/types";
import type { SampleImage } from "@/features/inspect/samples";
import { fetchFile } from "@/lib/files";
import { useUi } from "@/store/ui";
import { levelsFor, type Degradation } from "./levels";

export type SweepMethod = "fft" | "gabor" | "local_statistics";
export type SweepSize = 512 | 1024;
const DEBOUNCE_MS = 400;

/**
 * One image, one degradation, N levels. Any change re-runs the sweep after a pause and cancels the previous request.
 * With an active profile the sweep uses that profile's thresholds and working size (so it measures the profile's robustness).
 */
export function useRobustness() {
  const profileId = useUi((s) => s.profileId);
  const [image, setImage] = useState<File | null>(null);
  const [kind, setKind] = useState<Degradation>("gaussian_noise");
  const [steps, setSteps] = useState(7);
  const [method, setMethod] = useState<SweepMethod>("fft");
  const [size, setSize] = useState<SweepSize>(512);
  const [result, setResult] = useState<RobustnessOut | null>(null);
  const [resultKind, setResultKind] = useState<Degradation>("gaussian_noise");
  const [running, setRunning] = useState(false);
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
      form.append("degradations", kind);
      form.append("levels", JSON.stringify({ [kind]: levelsFor(kind, steps) }));
      form.append("method", method);
      if (profileId !== null) form.append("profile_id", String(profileId));
      else form.append("config", JSON.stringify({ max_side: size }));
      try {
        const out = await postForm<RobustnessOut>("/robustness", form, ctrl.signal);
        if (id === seq.current) {
          setResult(out);
          setResultKind(kind);
        }
      } catch (e) {
        if (!isAbort(e) && id === seq.current) toast.error("Sweep failed", { id: "robustness", description: errorMessage(e) });
      } finally {
        if (id === seq.current) setRunning(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [image, kind, steps, method, size, profileId]);

  useEffect(
    () => () => {
      seq.current += 1;
      controller.current?.abort();
    },
    [],
  );

  const loadSample = useCallback((s: SampleImage) => {
    fetchFile(s.url)
      .then((file) => {
        setImage(file);
        setResult(null);
      })
      .catch((e) => toast.error("Could not load the sample", { description: errorMessage(e) }));
  }, []);

  const acceptFile = useCallback((file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That is not an image", { description: `${file.name} is ${file.type || "an unknown type"}.` });
      return;
    }
    setImage(file);
    setResult(null);
  }, []);

  return { image, kind, setKind, steps, setSteps, method, setMethod, size, setSize, result, resultKind, running, profileId, loadSample, acceptFile };
}

export type RobustnessState = ReturnType<typeof useRobustness>;
