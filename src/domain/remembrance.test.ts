import { describe, expect, it } from "vitest";
import {
  MAX_REMEMBRANCES,
  assertWritableRemembrances,
  coerceRemembrance,
  isRemembrance,
  mergeImported,
  parseImport,
  sanitizeRemembrances,
  serializeExport,
} from "./remembrance";

const valid = {
  id: "r1",
  name: "Rivka bat Avraham",
  type: "Yahrzeit" as const,
  hy: 5780,
  hm: "Tevet",
  hd: 10,
  originalDate: "2020-01-07",
};

describe("remembrance domain", () => {
  it("coerces and validates records", () => {
    expect(isRemembrance(coerceRemembrance({ ...valid, name: "  Leah  ", hy: "5780", hd: "10" }))).toBe(true);
    expect(isRemembrance(coerceRemembrance({ ...valid, name: "" }))).toBe(false);
    expect(coerceRemembrance(null)).toBeNull();
  });

  it("sanitizes, exports, imports, and merges without I/O", () => {
    expect(sanitizeRemembrances([valid, { id: "bad" }])).toEqual([valid]);
    expect(serializeExport([valid], "t").remembrances).toEqual([valid]);
    expect(parseImport({ remembrances: [valid] })).toEqual([valid]);
    expect(() => parseImport("%PDF")).toThrow(/not valid JSON/);
    expect(() => parseImport([])).toThrow(/No valid remembrances/);

    const merged = mergeImported([valid], [valid, { ...valid, id: "r2", name: "Leah" }]);
    expect(merged.added).toBe(1);
    expect(merged.skipped).toBe(1);
  });

  it("enforces the hard write cap in the domain", () => {
    const rows = Array.from({ length: MAX_REMEMBRANCES + 1 }, (_, i) => ({ ...valid, id: `id-${i}`, name: `P${i}` }));
    expect(() => assertWritableRemembrances(rows)).toThrow(new RegExp(String(MAX_REMEMBRANCES)));
  });
});
