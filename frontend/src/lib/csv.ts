export type Cell = string | number | boolean | null | undefined;

/** Cells that a spreadsheet would run as a formula; prefixed with an apostrophe so file names cannot execute. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** RFC 4180 quoting plus spreadsheet-formula neutralisation for text cells. */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, Cell>>(rows: T[], columns: (keyof T & string)[]): string {
  const lines = [columns.join(","), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(","))];
  return lines.join("\r\n") + "\r\n";
}

/** Save text as a file. A UTF-8 byte-order mark makes Excel read non-ASCII file names correctly. */
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
