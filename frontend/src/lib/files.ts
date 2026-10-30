/** Download a same-origin URL (e.g. a sample image) as a File, ready to upload. */
export async function fetchFile(url: string): Promise<File> {
  const blob = await (await fetch(url)).blob();
  return new File([blob], url.split("/").pop() ?? "image.png", { type: blob.type || "image/png" });
}
