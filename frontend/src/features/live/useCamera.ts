import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { checkSupport, describeCameraError, type CameraFailure } from "./cameraErrors";

export type CameraState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "ready"; deviceId: string | null; facing: "user" | "environment" | null; width: number; height: number }
  | { status: "failed"; failure: CameraFailure };

const IDEAL_SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } };

/**
 * The browser camera (getUserMedia) attached to a <video> element.
 * Nothing is requested until `start()` is called, so the permission prompt follows a click.
 */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<CameraState>({ status: "idle" });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0); // ignore a start() that was superseded or stopped meanwhile

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === "videoinput"));
  }, []);

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [videoRef]);

  const stop = useCallback(() => {
    generation.current += 1;
    release();
    setState({ status: "idle" });
  }, [release]);

  const start = useCallback(
    async (deviceId?: string) => {
      const unsupported = checkSupport({ isSecureContext: window.isSecureContext, hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia) });
      if (unsupported) {
        setState({ status: "failed", failure: unsupported });
        return;
      }
      const mine = ++generation.current;
      release();
      setState({ status: "starting" });
      // phones: prefer the back camera unless a specific one was chosen
      const video: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId }, ...IDEAL_SIZE } : { facingMode: { ideal: "environment" }, ...IDEAL_SIZE };
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        if (mine !== generation.current) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        const el = videoRef.current;
        if (!el) throw new Error("video element missing");
        el.srcObject = media;
        await el.play();
        if (el.readyState < 1) await new Promise<void>((resolve) => el.addEventListener("loadedmetadata", () => resolve(), { once: true }));
        const track = media.getVideoTracks()[0]!;
        const settings = track.getSettings();
        track.addEventListener("ended", () => {
          if (mine === generation.current) {
            release();
            setState({ status: "failed", failure: { problem: "nocamera", title: "The camera was disconnected", help: "Reconnect it and press Try again." } });
          }
        });
        setState({
          status: "ready",
          deviceId: settings.deviceId ?? null,
          facing: settings.facingMode === "user" || settings.facingMode === "environment" ? settings.facingMode : null,
          width: el.videoWidth,
          height: el.videoHeight,
        });
        void refreshDevices(); // labels are only available once permission was granted
      } catch (error) {
        if (mine === generation.current) {
          release();
          setState({ status: "failed", failure: describeCameraError(error) });
        }
      }
    },
    [refreshDevices, release, videoRef],
  );

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  useEffect(
    () => () => {
      generation.current += 1;
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { state, devices, start, stop };
}
