import { describe, it, expect, vi } from "vitest";
import { createRemembranceRepository } from "./remembranceRepository";
import type { StorageLike } from "../application/ports";

function makeStorage(initial: Record<string, string> = {}): StorageLike {
  const _data = { ...initial };
  return {
    getItem: (key: string) => _data[key] ?? null,
    setItem: (key: string, value: string) => { _data[key] = value; },
  };
}

const validRecord = {
  id: "abc",
  name: "Test Person",
  type: "Yahrzeit",
  hy: 5786,
  hm: "Tishrei",
  hd: 1,
  originalDate: "2025-09-23",
};

describe("createRemembranceRepository", () => {
  it("list returns empty array for empty storage", () => {
    const repo = createRemembranceRepository({ storage: makeStorage() });
    expect(repo.list()).toEqual([]);
  });

  it("list returns parsed records from storage", () => {
    const storage = makeStorage({
      "or-zarua-remembrances": JSON.stringify([validRecord]),
    });
    const repo = createRemembranceRepository({ storage });
    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0].name).toBe("Test Person");
  });

  it("list returns empty on corrupt JSON", () => {
    const storage = makeStorage({ "or-zarua-remembrances": "not json" });
    const repo = createRemembranceRepository({ storage });
    expect(repo.list()).toEqual([]);
  });

  it("list filters invalid records", () => {
    const storage = makeStorage({
      "or-zarua-remembrances": JSON.stringify([validRecord, { ...validRecord, name: "" }]),
    });
    const repo = createRemembranceRepository({ storage });
    expect(repo.list()).toHaveLength(1);
  });

  it("saveAll writes valid records to storage", () => {
    const storage = makeStorage();
    const repo = createRemembranceRepository({ storage });
    repo.saveAll([validRecord as never]);
    const stored = JSON.parse(storage.getItem("or-zarua-remembrances")!);
    expect(stored).toHaveLength(1);
  });

  it("saveAll throws on invalid records", () => {
    const repo = createRemembranceRepository({ storage: makeStorage() });
    expect(() => repo.saveAll([{ ...validRecord, name: "" } as never])).toThrow();
  });

  it("mergeUpcoming patches matching records", () => {
    const storage = makeStorage({
      "or-zarua-remembrances": JSON.stringify([validRecord]),
    });
    const repo = createRemembranceRepository({ storage });
    const updates = new Map([["abc", { nextIso: "2026-09-23", nextFormatted: "Wed Sep 23" }]]);
    repo.mergeUpcoming(updates);
    const records = repo.list();
    expect(records[0].nextIso).toBe("2026-09-23");
    expect(records[0].nextFormatted).toBe("Wed Sep 23");
  });
});
