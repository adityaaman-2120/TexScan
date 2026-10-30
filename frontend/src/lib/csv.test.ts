import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves plain values alone and blanks null / undefined", () => {
    expect(csvCell("plain.png")).toBe("plain.png");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(0.5)).toBe("0.5");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("x\r\ny")).toBe('"x\r\ny"');
  });

  it("neutralises spreadsheet formulas in text but not in numbers", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("normal-name.png")).toBe("normal-name.png");
  });
});

describe("toCsv", () => {
  it("writes a header and CRLF-terminated rows in the requested column order", () => {
    const csv = toCsv([{ name: "a.png", n: 1, note: "x,y" }, { name: "b.png", n: 2, note: null }], ["n", "name", "note"]);
    expect(csv).toBe('n,name,note\r\n1,a.png,"x,y"\r\n2,b.png,\r\n');
  });

  it("is just a header for no rows", () => {
    expect(toCsv<{ a: string }>([], ["a"])).toBe("a\r\n");
  });
});
