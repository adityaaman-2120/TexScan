import { describe, expect, it } from "vitest";
import { chunk, fromFileList, isImageFile, uniquePaths } from "./pickFiles";

const file = (name: string, type = "image/png", rel = "") => Object.assign(new File(["x"], name, { type }), { webkitRelativePath: rel });

describe("isImageFile", () => {
  it("accepts by MIME type or extension", () => {
    expect(isImageFile({ name: "a.bin", type: "image/png" })).toBe(true);
    expect(isImageFile({ name: "SCAN.JPG", type: "" })).toBe(true);
    expect(isImageFile({ name: "x.tiff", type: "" })).toBe(true);
    expect(isImageFile({ name: "notes.txt", type: "text/plain" })).toBe(false);
    expect(isImageFile({ name: "archive.png.zip", type: "application/zip" })).toBe(false);
  });
});

describe("fromFileList", () => {
  it("keeps images, counts the rest, and uses the folder path when there is one", () => {
    const { images, skipped } = fromFileList([file("a.png"), file("b.jpg", "", "roll/sub/b.jpg"), file("readme.md", "text/markdown"), file(".DS_Store", "")]);
    expect(images.map((p) => p.path)).toEqual(["a.png", "roll/sub/b.jpg"]);
    expect(skipped).toBe(2);
  });

  it("handles an empty selection", () => {
    expect(fromFileList([])).toEqual({ images: [], skipped: 0 });
  });
});

describe("uniquePaths", () => {
  it("numbers repeated names before the extension and leaves unique ones alone", () => {
    expect(uniquePaths(["a.png", "b.png", "a.png", "a.png"])).toEqual(["a.png", "b.png", "a (2).png", "a (3).png"]);
  });

  it("does not mistake a dot in a folder name for an extension", () => {
    expect(uniquePaths(["v1.2/readme", "v1.2/readme"])).toEqual(["v1.2/readme", "v1.2/readme (2)"]);
  });

  it("keeps different folders distinct", () => {
    expect(uniquePaths(["x/a.png", "y/a.png"])).toEqual(["x/a.png", "y/a.png"]);
  });
});

describe("chunk", () => {
  it("splits into batches of at most `size`", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });
});
