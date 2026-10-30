import { useState, type RefObject } from "react";
import { postForm } from "@/api/client";
import type { ProfileOut } from "@/api/types";
import { CALIBRATION_FRAMES, CALIBRATION_GAP_MS, calibrationName } from "./calibration";
import { grabJpeg } from "./frames";
import { UPLOAD_SIDE } from "./liveMath";

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>;
  sendSide: number;
  method: string;
  /** inspect only the middle part of the picture (1 = all of it); must match live mode */
  center: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Learns what "good" looks like for this camera, cloth and lighting: grabs a few frames exactly as live mode would send them
 * and has the server tune a profile (threshold and minimum area) on them. Resolves to the new profile.
 */
export function useCalibrate({ videoRef, sendSide, method, center }: Options) {
  const [taken, setTaken] = useState(0);
  const [running, setRunning] = useState(false);

  const run = async (): Promise<ProfileOut> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) throw new Error("The camera is not ready yet.");
    setRunning(true);
    setTaken(0);
    try {
      const form = new FormData();
      const canvas = document.createElement("canvas");
      for (let i = 0; i < CALIBRATION_FRAMES; i++) {
        const blob = await grabJpeg(video, canvas, UPLOAD_SIDE);
        if (!blob) throw new Error("Could not read a camera frame.");
        form.append("images", new File([blob], `frame-${i + 1}.jpg`, { type: "image/jpeg" }));
        setTaken(i + 1);
        if (i < CALIBRATION_FRAMES - 1) await sleep(CALIBRATION_GAP_MS);
      }
      form.append("name", calibrationName(new Date()));
      form.append("method", method);
      form.append("config", JSON.stringify({ max_side: sendSide, trim_borders: true, center_fraction: center }));
      return await postForm<ProfileOut>("/profiles/autotune", form);
    } finally {
      setRunning(false);
    }
  };

  return { run, running, taken, total: CALIBRATION_FRAMES };
}
