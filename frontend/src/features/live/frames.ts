import { fitFrame } from "./liveMath";

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/** A downscaled JPEG of the current video frame (longest side `side`), for streaming. */
export async function grabJpeg(video: HTMLVideoElement, canvas: HTMLCanvasElement, side: number, quality = 0.7): Promise<Blob | null> {
  const { w, h } = fitFrame(video.videoWidth, video.videoHeight, side);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
  return toBlob(canvas, "image/jpeg", quality);
}

/** The current video frame at full camera resolution, losslessly, as a file ready for a full inspection. */
export async function captureFullFrame(video: HTMLVideoElement): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  const blob = await toBlob(canvas, "image/png");
  if (!blob) throw new Error("could not read the camera frame");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return new File([blob], `capture-${stamp}.png`, { type: "image/png" });
}
