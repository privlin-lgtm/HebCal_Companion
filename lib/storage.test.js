import { describe, expect, it } from "vitest";
import {
  LOCATION_KEY,
  STORAGE_KEY,
  isRemembrance,
  mergeImported,
  mergeUpcomingDates,
  parseImport,
  readLastLocation,
  readRemembrances,
  serializeExport,
  writeLastLocation,
  writeRemembrances,
} from "./storage.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.hasOwn(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

const valid = {
  id: "r1",
  name: "Rivka bat Avraham",
  type: "Yahrzeit",
  hy: 5780,
  hm: "Tevet",
  hd: 10,
  originalDate: "2020-01-07",
};

describe("isRemembrance", () => {
  it("accepts a complete record and rejects tampered rows", () => {
    expect(isRemembrance(valid)).toBe(true);
    expect(isRemembrance({ ...valid, name: "" })).toBe(false);
    expect(isRemembrance({ ...valid, type: "Birthday" })).toBe(false);
    expect(isRemembrance({ ...valid, hm: "March" })).toBe(false);
  });
});

describe("readRemembrances / writeRemembrances", () => {
  it("drops invalid rows and keeps valid ones", () => {
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify([valid, { id: "bad", name: "x" }, "nope"]),
    });
    expect(readRemembrances(storage)).toEqual([valid]);
  });

  it("returns an empty list when storage is corrupt", () => {
    expect(readRemembrances(memoryStorage({ [STORAGE_KEY]: "{not-json" }))).toEqual([]);
  });

  it("refuses to write an invalid record", () => {
    expect(() => writeRemembrances([{ id: "bad" }], memoryStorage())).toThrow(/missing required fields/);
  });

  it("explains a quota failure", () => {
    const storage = {
      getItem: () => "[]",
      setItem: () => {
        const error = new Error("full");
        error.name = "QuotaExceededError";
        throw error;
      },
    };
    expect(() => writeRemembrances([valid], storage)).toThrow(/out of space/);
  });
});

describe("mergeUpcomingDates", () => {
  it("patches by id without dropping a record added during refresh", () => {
    const storage = memoryStorage();
    writeRemembrances([valid], storage);
    const added = { ...valid, id: "r2", name: "New remembrance" };
    writeRemembrances([valid, added], storage);
    mergeUpcomingDates(new Map([["r1", { nextIso: "2026-12-20", nextFormatted: "Sunday, December 20, 2026" }]]), storage);
    const records = readRemembrances(storage);
    expect(records).toHaveLength(2);
    expect(records.find((row) => row.id === "r1").nextIso).toBe("2026-12-20");
    expect(records.find((row) => row.id === "r2").name).toBe("New remembrance");
  });
});

describe("export / import", () => {
  it("round-trips records and skips duplicates on merge", () => {
    const payload = serializeExport([valid], "2026-08-30T00:00:00.000Z");
    expect(payload.version).toBe(1);
    const incoming = parseImport(JSON.stringify(payload));
    const merged = mergeImported([valid], incoming);
    expect(merged.added).toBe(0);
    expect(merged.skipped).toBe(1);
    const extra = parseImport({ remembrances: [{ ...valid, id: "r2", name: "Leah" }] });
    expect(mergeImported([valid], extra).added).toBe(1);
  });

  it("rejects a file that is not a remembrance list", () => {
    expect(() => parseImport({ hello: true })).toThrow(/does not contain remembrances/);
  });
});

describe("last location", () => {
  it("persists and rejects a malformed location", () => {
    const storage = memoryStorage();
    writeLastLocation({ kind: "geonameid", id: "281184" }, "Jerusalem, Israel", storage);
    expect(readLastLocation(storage)).toEqual({
      location: { kind: "geonameid", id: "281184" },
      name: "Jerusalem, Israel",
    });
    storage.setItem(LOCATION_KEY, JSON.stringify({ name: "Paris", location: { kind: "city" } }));
    expect(readLastLocation(storage)).toBeNull();
  });
});
