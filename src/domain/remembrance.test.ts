import { describe, it, expect } from "vitest";
import {
  coerceRemembrance,
  isRemembrance,
  sanitizeRemembrances,
  assertWritableRemembrances,
  parseImport,
  mergeImported,
  serializeExport,
  sortByNextIso,
  MAX_REMEMBRANCES,
  type RemembranceInput,
} from "./remembrance";

const validRow: RemembranceInput = {
  id: "abc123",
  name: "Rivka bat Avraham",
  type: "Yahrzeit",
  hy: 5786,
  hm: "Tishrei",
  hd: 1,
  originalDate: "2025-09-23",
  nextIso: "2026-09-23",
  nextFormatted: "Wednesday, September 23, 2026",
};

describe("coerceRemembrance", () => {
  it("coerces a valid row", () => {
    const result = coerceRemembrance(validRow);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Rivka bat Avraham");
  });
  it("returns null for null input", () => {
    expect(coerceRemembrance(null)).toBeNull();
  });
});

describe("isRemembrance", () => {
  it("validates a correct record", () => {
    const record = coerceRemembrance(validRow)!;
    expect(isRemembrance(record)).toBe(true);
  });
  it("rejects empty name", () => {
    const record = coerceRemembrance({ ...validRow, name: "" })!;
    expect(isRemembrance(record)).toBe(false);
  });
  it("rejects invalid type", () => {
    const record = coerceRemembrance({ ...validRow, type: "Birthday" })!;
    expect(isRemembrance(record)).toBe(false);
  });
  it("rejects invalid month", () => {
    const record = coerceRemembrance({ ...validRow, hm: "January" })!;
    expect(isRemembrance(record)).toBe(false);
  });
  it("rejects invalid day", () => {
    const record = coerceRemembrance({ ...validRow, hd: 31 })!;
    expect(isRemembrance(record)).toBe(false);
  });
});

describe("sanitizeRemembrances", () => {
  it("filters invalid rows and caps at MAX", () => {
    const rows = [validRow, { ...validRow, id: "bad", name: "" }, { ...validRow, id: "def" }];
    const result = sanitizeRemembrances(rows);
    expect(result).toHaveLength(2);
  });
});

describe("assertWritableRemembrances", () => {
  it("throws on invalid rows", () => {
    expect(() => assertWritableRemembrances([{ ...validRow, name: "" }])).toThrow();
  });
  it("returns coerced rows when valid", () => {
    const result = assertWritableRemembrances([validRow]);
    expect(result).toHaveLength(1);
  });
});

describe("parseImport", () => {
  it("parses a valid JSON array", () => {
    const json = JSON.stringify([validRow]);
    const result = parseImport(json);
    expect(result).toHaveLength(1);
  });
  it("parses an object with remembrances array", () => {
    const json = JSON.stringify({ remembrances: [validRow] });
    const result = parseImport(json);
    expect(result).toHaveLength(1);
  });
  it("throws on invalid JSON", () => {
    expect(() => parseImport("not json")).toThrow();
  });
  it("throws on empty array", () => {
    expect(() => parseImport("[]")).toThrow();
  });
});

describe("mergeImported", () => {
  it("adds new records and skips duplicates", () => {
    const existing = [coerceRemembrance(validRow)!];
    const incoming = [
      coerceRemembrance(validRow)!, // same id — skip
      coerceRemembrance({ ...validRow, id: "new1" })!,
    ];
    const result = mergeImported(existing, incoming);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.records).toHaveLength(2);
  });
});

describe("serializeExport", () => {
  it("produces a valid export with version 2", () => {
    const result = serializeExport([validRow]);
    expect(result.version).toBe(2);
    expect(result.remembrances).toHaveLength(1);
    expect(result.exportedAt).toBeDefined();
  });
});

describe("sortByNextIso", () => {
  it("sorts by nextIso ascending", () => {
    const records = [
      coerceRemembrance({ ...validRow, id: "a", nextIso: "2026-12-01" })!,
      coerceRemembrance({ ...validRow, id: "b", nextIso: "2026-01-01" })!,
      coerceRemembrance({ ...validRow, id: "c", nextIso: null })!,
    ];
    const sorted = sortByNextIso(records);
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("a");
    expect(sorted[2].id).toBe("c"); // null sorts last
  });
});
