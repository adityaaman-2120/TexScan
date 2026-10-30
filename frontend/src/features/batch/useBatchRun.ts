import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { API_BASE, client, postForm, unwrap } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { BatchAccepted, Method } from "@/api/types";
import { toCsv } from "@/lib/csv";
import { applyEvent, applyRejections, isFinished, markRunning, summarize, type BatchEvent, type BatchItem } from "./batchState";
import { chunk, uniquePaths, type Picked } from "./pickFiles";

const CHUNK = 100; // the API accepts at most 100 images per batch
const POLL_MS = 1000;
const POLL_TRIES = 300;
const MAX_PREVIEWS = 150; // beyond this, tiles show a placeholder instead of decoding every image

export interface RunOptions {
  method: Method;
  profileId: number | null;
}

const socketUrl = (batchId: string): string => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${API_BASE}/ws/batch/${batchId}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a folder / many images as one or more batches and follows each over its WebSocket.
 * If the socket drops before the batch completes, it falls back to polling the REST endpoints.
 */
export function useBatchRun() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [phase, setPhase] = useState<"idle" | "running" | "complete">("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [finishedAt, setFinishedAt] = useState(0);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [options, setOptions] = useState<RunOptions | null>(null);

  const files = useRef(new Map<string, File>());
  const socket = useRef<WebSocket | null>(null);
  const run = useRef(0);
  const previews = useRef(new Map<string, string>());

  const dropPreviews = () => {
    previews.current.forEach((url) => URL.revokeObjectURL(url));
    previews.current = new Map();
  };

  const closeSocket = () => {
    socket.current?.close();
    socket.current = null;
  };
  useEffect(
    () => () => {
      run.current += 1;
      closeSocket();
      dropPreviews();
    },
    [],
  );

  /** Fallback: wait for the batch to finish via REST, then read the stored results back. */
  const reconcile = useCallback(async (batchId: string, runId: number) => {
    for (let i = 0; i < POLL_TRIES && run.current === runId; i++) {
      const status = await unwrap(client.GET("/inspect/batch/{batch_id}", { params: { path: { batch_id: batchId } } })).catch(() => null);
      if (status?.status === "complete") break;
      await sleep(POLL_MS);
    }
    if (run.current !== runId) return;
    const page = await unwrap(client.GET("/inspections", { params: { query: { batch_id: batchId, limit: 200 } } })).catch(() => null);
    if (!page) return;
    setItems((prev) => {
      let next = prev;
      for (const row of page.items) {
        next = applyEvent(next, { type: "progress", filename: row.filename, total: 0, done: 0, inspection_id: row.id, decision: row.decision, defect_count: row.defect_count });
      }
      return next;
    });
  }, []);

  const watch = useCallback(
    (batchId: string, runId: number) =>
      new Promise<void>((resolve) => {
        const ws = new WebSocket(socketUrl(batchId));
        socket.current = ws;
        let settled = false;
        const finish = (viaFallback: boolean) => {
          if (settled) return;
          settled = true;
          ws.close();
          if (viaFallback) void reconcile(batchId, runId).then(resolve);
          else resolve();
        };
        ws.onmessage = (message) => {
          if (run.current !== runId) return finish(false);
          const event = JSON.parse(message.data as string) as BatchEvent;
          setItems((prev) => markRunning(applyEvent(prev, event)));
          if (event.type === "complete" || event.type === "error") finish(false);
        };
        ws.onerror = () => finish(true);
        ws.onclose = () => finish(true);
      }),
    [reconcile],
  );

  const start = useCallback(
    async (picked: Picked[], opts: RunOptions) => {
      if (picked.length === 0) return;
      const runId = ++run.current;
      closeSocket();
      const keys = uniquePaths(picked.map((p) => p.path));
      files.current = new Map(keys.map((key, i) => [key, picked[i]!.file]));
      dropPreviews();
      if (picked.length <= MAX_PREVIEWS) previews.current = new Map(keys.map((key, i) => [key, URL.createObjectURL(picked[i]!.file)]));
      setItems(markRunning(keys.map((key, i) => ({ key, size: picked[i]!.file.size, status: "queued" as const }))));
      setBatchIds([]);
      setOptions(opts);
      setStartedAt(Date.now());
      setPhase("running");

      try {
        for (const group of chunk(keys, CHUNK)) {
          if (run.current !== runId) return;
          const form = new FormData();
          group.forEach((key) => form.append("images", files.current.get(key)!, key)); // the unique key is the file name
          if (opts.profileId !== null) form.append("profile_id", String(opts.profileId));
          form.append("method", opts.method);
          const accepted = await postForm<BatchAccepted>("/inspect/batch", form);
          if (run.current !== runId) return;
          setBatchIds((ids) => [...ids, accepted.batch_id]);
          setItems((prev) => markRunning(applyRejections(prev, accepted.rejected)));
          await watch(accepted.batch_id, runId);
        }
      } catch (e) {
        if (run.current === runId) {
          toast.error("Batch could not be sent", { id: "batch", description: errorMessage(e) });
          setItems((prev) => prev.map((i) => (i.status === "queued" || i.status === "running" ? { ...i, status: "error", error: "not sent" } : i)));
        }
      }
      if (run.current === runId) {
        setFinishedAt(Date.now());
        setPhase("complete");
      }
    },
    [watch],
  );

  const reset = useCallback(() => {
    run.current += 1;
    closeSocket();
    files.current = new Map();
    dropPreviews();
    setItems([]);
    setBatchIds([]);
    setOptions(null);
    setPhase("idle");
  }, []);

  /** Results with area, method and time for the CSV; falls back to what the socket reported. */
  const exportCsv = useCallback(async (): Promise<string> => {
    const details = new Map<string, { area: number; method: string; at: string; id: number }>();
    for (const id of batchIds) {
      const page = await unwrap(client.GET("/inspections", { params: { query: { batch_id: id, limit: 200 } } })).catch(() => null);
      page?.items.forEach((row) => details.set(row.filename, { area: row.defect_area_percent, method: row.method, at: row.created_at, id: row.id }));
    }
    const rows = items.map((item) => {
      const d = details.get(item.key);
      return {
        filename: item.key,
        decision: item.decision ?? (item.status === "error" ? "ERROR" : ""),
        defect_count: item.defectCount ?? "",
        defect_area_percent: d ? Number(d.area.toFixed(4)) : "",
        method: d?.method ?? options?.method ?? "",
        inspection_id: item.inspectionId ?? d?.id ?? "",
        processed_at: d?.at ?? "",
        error: item.error ?? "",
      };
    });
    return toCsv(rows, ["filename", "decision", "defect_count", "defect_area_percent", "method", "inspection_id", "processed_at", "error"]);
  }, [items, batchIds, options]);

  const preview = (key: string): string | undefined => previews.current.get(key);

  return { items, phase, startedAt, finishedAt, batchIds, options, start, reset, exportCsv, preview, summary: summarize(items), finished: isFinished(items) };
}
