import { motion } from "framer-motion";
import { useState } from "react";
import { CircleCheck, CircleX, ImageOff, Loader2, TriangleAlert } from "lucide-react";
import { fileUrl } from "@/api/client";
import { cn } from "@/lib/utils";
import type { BatchItem } from "./batchState";

interface BatchTileProps {
  item: BatchItem;
  /** local object URL of the file being inspected (absent for very large batches) */
  preview: string | undefined;
  onOpen: (inspectionId: number) => void;
}

const FACE = "absolute inset-0 overflow-hidden rounded-lg border [backface-visibility:hidden]";

/**
 * A square that shows the local image while waiting and flips to the result (overlay + PASS / FAIL) when it finishes.
 */
export function BatchTile({ item, preview, onOpen }: BatchTileProps) {
  const [previewBroken, setPreviewBroken] = useState(false); // e.g. a corrupt file the browser cannot decode
  const done = item.status === "done";
  const pass = item.decision === "PASS";
  const name = item.key.split("/").pop() ?? item.key;

  const label = done ? `${name}: ${item.decision}, ${item.defectCount} defects` : item.status === "error" ? `${name}: failed. ${item.error}` : `${name}: ${item.status}`;

  return (
    <div className="[perspective:900px]">
      <motion.div
        className="relative aspect-square [transform-style:preserve-3d]"
        initial={false}
        animate={{ rotateY: done ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 140, damping: 18 }}
      >
        {/* front: the original while it waits */}
        <div className={cn(FACE, "bg-card", item.status === "error" && "border-destructive/50")} aria-hidden={done}>
          {preview && !previewBroken ? <img src={preview} alt="" loading="lazy" decoding="async" onError={() => setPreviewBroken(true)} className={cn("size-full object-cover transition-opacity", item.status === "queued" && "opacity-50")} /> : <div className="flex size-full items-center justify-center bg-muted"><ImageOff className="size-6 text-muted-foreground" /></div>}
          {item.status === "running" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40">
              <Loader2 className="size-6 animate-spin text-primary" aria-label="Inspecting" />
              <div className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-primary" />
            </div>
          )}
          {item.status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80 p-2 text-center">
              <TriangleAlert className="size-5 text-destructive" />
              <span className="line-clamp-3 text-[11px] leading-tight text-destructive">{item.error}</span>
            </div>
          )}
          <span className="absolute inset-x-0 bottom-0 truncate bg-background/75 px-2 py-1 text-[11px] backdrop-blur">{name}</span>
        </div>

        {/* back: the result */}
        <button
          type="button"
          disabled={!done}
          tabIndex={done ? 0 : -1}
          aria-label={label}
          onClick={() => item.inspectionId !== undefined && onOpen(item.inspectionId)}
          className={cn(FACE, "bg-card text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring [transform:rotateY(180deg)]", pass ? "border-success/50" : "border-destructive/50")}
        >
          {done && item.inspectionId !== undefined && <img src={fileUrl(`/files/${item.inspectionId}/overlay.png`)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
          <span
            className={cn(
              "num absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur",
              pass ? "border-success/50 bg-background/85 text-success" : "border-destructive/50 bg-background/85 text-destructive",
            )}
          >
            {pass ? <CircleCheck className="size-3" /> : <CircleX className="size-3" />}
            {item.decision}
          </span>
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-background/75 px-2 py-1 text-[11px] backdrop-blur">
            <span className="truncate">{name}</span>
            <span className="num shrink-0 text-muted-foreground">{item.defectCount}</span>
          </span>
        </button>
      </motion.div>
    </div>
  );
}
