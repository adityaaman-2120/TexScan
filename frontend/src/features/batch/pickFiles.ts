export const IMAGE_EXT = /\.(png|jpe?g|bmp|tiff?|webp)$/i;

export const isImageFile = (f: { name: string; type: string }): boolean => f.type.startsWith("image/") || IMAGE_EXT.test(f.name);

export interface Picked {
  file: File;
  /** path inside the dropped folder (or just the file name); shown in the grid and stored as the file name */
  path: string;
}

export interface PickResult {
  images: Picked[];
  /** files that were ignored because they are not images */
  skipped: number;
}

function toResult(all: Picked[]): PickResult {
  const images = all.filter((p) => isImageFile(p.file));
  return { images, skipped: all.length - images.length };
}

/** From a file input (`webkitdirectory` fills webkitRelativePath). */
export function fromFileList(files: Iterable<File>): PickResult {
  return toResult([...files].map((file) => ({ file, path: file.webkitRelativePath || file.name })));
}

/** Make paths unique by numbering repeats: `a.png`, `a (2).png`, `a (3).png`. */
export function uniquePaths(paths: string[]): string[] {
  const seen = new Map<string, number>();
  return paths.map((path) => {
    const n = (seen.get(path) ?? 0) + 1;
    seen.set(path, n);
    if (n === 1) return path;
    const dot = path.lastIndexOf(".");
    const slash = path.lastIndexOf("/");
    return dot > slash ? `${path.slice(0, dot)} (${n})${path.slice(dot)}` : `${path} (${n})`;
  });
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, out: Picked[]): Promise<void> {
  if (entry.isFile) {
    out.push({ file: await entryFile(entry as FileSystemFileEntry), path: entry.fullPath.replace(/^\//, "") });
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await readEntries(reader); // readEntries returns at most ~100 entries per call
    if (batch.length === 0) return;
    for (const child of batch) await walk(child, out);
  }
}

/** From a drop event: expands dropped folders recursively. Must be called synchronously from the drop handler. */
export async function fromDataTransfer(dt: DataTransfer): Promise<PickResult> {
  const entries = [...dt.items].filter((i) => i.kind === "file").map((i) => i.webkitGetAsEntry?.() ?? null);
  if (entries.length === 0 || entries.some((e) => e === null)) return fromFileList(dt.files);
  const out: Picked[] = [];
  for (const entry of entries) await walk(entry!, out);
  return toResult(out);
}
