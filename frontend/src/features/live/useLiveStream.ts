import { useEffect, useRef, useState, type RefObject } from "react";
import { grabJpeg } from "./frames";
import { backoffSeconds, fpsFrom, liveSocketUrl, MAX_RECONNECTS, mean } from "./liveMath";

export interface LiveDefect {
  bbox: [number, number, number, number];
  defect_type: string | null;
  type_confidence: number | null;
}

/** One message from /ws/live. */
export interface LiveResult {
  type: "result";
  width: number; // working-image size: defect boxes are in these pixels
  height: number;
  decision: "PASS" | "FAIL";
  defect_count: number;
  defect_area_percent: number;
  defects: LiveDefect[];
  overlay: string;
  process_ms: number;
}

export type LiveStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline" | "error";

export interface LiveStats {
  fps: number;
  /** round trip: frame leaves the browser until its result arrives */
  latencyMs: number | null;
  /** time the server spent on the pipeline */
  processMs: number | null;
}

const MIN_GAP_MS = 200; // the server processes at most 5 frames a second
const INFLIGHT_TIMEOUT_MS = 2000; // give up waiting for a result and send the next frame
const TICK_MS = 40;
const SAMPLES = 10; // averaging window for latency

interface Options {
  enabled: boolean;
  paused: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  method: string;
  profileId: number | null;
  sendSide: number;
}

/**
 * Streams downscaled JPEG frames to /ws/live and exposes the latest result.
 * At most one frame is in flight: the next is sent when the previous result arrives (and no sooner than 200 ms),
 * so the rate adapts to the server instead of piling frames up. Reconnects with backoff if the socket drops.
 */
export function useLiveStream({ enabled, paused, videoRef, method, profileId, sendSide }: Options) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [result, setResult] = useState<LiveResult | null>(null);
  const [resultAt, setResultAt] = useState<number | null>(null);
  const [stats, setStats] = useState<LiveStats>({ fps: 0, latencyMs: null, processMs: null });
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const socket = useRef<WebSocket | null>(null);
  const inflight = useRef<number | null>(null);
  const lastSent = useRef(0);
  const grabbing = useRef(false);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const arrivals = useRef<number[]>([]);
  const latencies = useRef<number[]>([]);
  const processing = useRef<number[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const sendSideRef = useRef(sendSide);
  sendSideRef.current = sendSide;

  // connection (re-opened when the settings that the server reads change)
  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    let closedByUs = false;
    let attempt = 0;
    let timer: number | undefined;
    arrivals.current = [];
    latencies.current = [];
    processing.current = [];

    const connect = () => {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      const sock = new WebSocket(liveSocketUrl({ protocol: location.protocol, host: location.host, method, profileId, maxSide: sendSideRef.current }));
      socket.current = sock;
      sock.onopen = () => {
        attempt = 0;
        inflight.current = null;
        setServerMessage(null);
        setStatus("live");
      };
      sock.onmessage = (message) => {
        const data = JSON.parse(message.data as string) as LiveResult | { type: "error"; message: string };
        const now = performance.now();
        if (data.type === "error") {
          inflight.current = null;
          setServerMessage(data.message);
          return;
        }
        if (inflight.current !== null) latencies.current = [...latencies.current, now - inflight.current].slice(-SAMPLES);
        inflight.current = null;
        arrivals.current = [...arrivals.current, now].filter((t) => now - t < 5000);
        processing.current = [...processing.current, data.process_ms].slice(-SAMPLES);
        setServerMessage(null);
        setResult(data);
        setResultAt(now);
      };
      sock.onclose = (event) => {
        if (closedByUs) return;
        socket.current = null;
        inflight.current = null;
        if (event.code === 1008) return setStatus("error"); // the server rejected the settings and said why
        if (attempt >= MAX_RECONNECTS) return setStatus("offline");
        setStatus("reconnecting");
        timer = window.setTimeout(connect, backoffSeconds(attempt++) * 1000);
      };
    };
    connect();
    return () => {
      closedByUs = true;
      window.clearTimeout(timer);
      socket.current?.close();
      socket.current = null;
      inflight.current = null;
    };
  }, [enabled, method, profileId, retryKey]);

  // sending
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(async () => {
      const sock = socket.current;
      const video = videoRef.current;
      if (!sock || sock.readyState !== WebSocket.OPEN || !video || video.readyState < 2 || video.videoWidth === 0) return;
      if (pausedRef.current || document.hidden || grabbing.current) return;
      const now = performance.now();
      if (now - lastSent.current < MIN_GAP_MS) return;
      if (inflight.current !== null && now - inflight.current < INFLIGHT_TIMEOUT_MS) return;
      grabbing.current = true;
      try {
        const blob = await grabJpeg(video, (scratch.current ??= document.createElement("canvas")), sendSideRef.current);
        if (blob && sock.readyState === WebSocket.OPEN) {
          sock.send(blob);
          lastSent.current = inflight.current = performance.now();
        }
      } finally {
        grabbing.current = false;
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled, videoRef]);

  // readouts, refreshed twice a second so the numbers do not flicker
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const now = performance.now();
      setStats({ fps: paused ? 0 : fpsFrom(arrivals.current, now), latencyMs: mean(latencies.current), processMs: mean(processing.current) });
    }, 500);
    return () => window.clearInterval(id);
  }, [enabled, paused]);

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      setResultAt(null);
      setStats({ fps: 0, latencyMs: null, processMs: null });
    }
  }, [enabled]);

  return { status, result, resultAt, stats, serverMessage, reconnect: () => setRetryKey((k) => k + 1) };
}
