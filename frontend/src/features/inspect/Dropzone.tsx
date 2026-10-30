import { motion } from "framer-motion";
import { ImagePlus, UploadCloud } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Kbd, modKey } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  onFile: (file: File | undefined) => void;
  compact?: boolean;
}

/** Drag-and-drop target that also opens the file picker (click or Enter). Pasting is handled page-wide. */
export function Dropzone({ onFile, compact }: DropzoneProps) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label="Choose or drop an image"
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onFile(e.dataTransfer.files[0]);
      }}
      animate={{ scale: over ? 1.01 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
        over ? "border-primary bg-primary/10" : "border-border bg-card/50 hover:border-primary/50 hover:bg-primary/5",
        compact ? "gap-1 px-4 py-5" : "min-h-[260px] gap-3 px-6 py-12",
      )}
    >
      <input
        ref={input}
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ""; // allow choosing the same file again
        }}
      />
      {compact ? (
        <>
          <ImagePlus className="size-5 text-primary" />
          <span className="text-[13px] font-medium">Replace image</span>
          <span className="text-xs text-muted-foreground">Drop, click or paste</span>
        </>
      ) : (
        <>
          <motion.div
            animate={over ? { y: -6 } : { y: 0 }}
            className="flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary"
          >
            <UploadCloud className="size-7" />
          </motion.div>
          <div>
            <p className="text-base font-semibold">{over ? "Release to inspect" : "Drop an image to inspect"}</p>
            <p className="mt-1 text-sm text-muted-foreground">or click to browse your files</p>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Press <Kbd>U</Kbd> to browse, or paste with <Kbd>{modKey}</Kbd>
            <Kbd>V</Kbd>
          </p>
        </>
      )}
    </motion.div>
  );
}
