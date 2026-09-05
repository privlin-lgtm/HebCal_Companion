import { describe, it, expect } from "vitest";
import { createRemembranceRepository } from "./remembranceRepository";
import type { Remembrance, StorageLike } from "../application/ports";

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
} as Remembrance;

describe("createRemembranceRepository", () => {
  it("list returns empty array for empty storage", async () => {
    const repo = createRemembranceRepository({ storage: makeStorage() });
    expect(await repo.list()).toEqual([]);
  });

  it("list returns parsed records from storage", async () => {
    const storage = makeStorage({
      "or-zarua-remembrances": JSON.stringify([validRecord]),
    });
    const repo = createRemembranceRepository({ storage });
    expect(await repo.list()).toHaveLength(1);
    expect((await repo.list())[0].name).toBe("Test Person");
  });

  it("list returns empty on corrupt JSON", async () => {
    const storage = makeStorage({ "or-zarua-remembrances": "not json" });
    const repo = createRemembranceRepository({ storage });
    expect(await repo.list()).toEqual([]);
  });

  it("list filters invalid records", async () => {
    const storage = makeStorage({
      "or-zarua-remembrances": JSON.stringify([validRecord, { ...validRecord, name: "" }]),
    });
    const repo = createRemembranceRepository({ storage });
    expect(await repo.list()).toHaveLength(1);
  });

  it("saveAll writes valid records to storage", async () => {
    const storage = makeStorage();
    const repo = createRemembranceRepository({ storage });
    await repo.saveAll([validRecord]);
    const stored = JSON.parse(storage.getItem("or-zarua-remembrances")!);
    expect(stored).toHaveLength(1);
  });

  it("saveAll throws on invalid records", async () => {
    const repo = createRemembranceRepository({ storage: makeStorage() });
    await expect(repo.saveAll([{ ...validRecord, name: "" } as Remembrance])).rejects.toThrow();
  });

  it("mergeUpcoming patches matching records", async () => {
    const storage = makeStorage({
      "or-zarua-remembrances": JSON.stringify([validRecord]),
    });
    const repo = createRemembranceRepository({ storage });
    const updates = new Map([["abc", { nextIso: "2026-09-23", nextFormatted: "Wed Sep 23" }]]);
    await repo.mergeUpcoming(updates);
    const records = await repo.list();
    expect(records[0].nextIso).toBe("2026-09-23");
    expect(records[0].nextFormatted).toBe("Wed Sep 23");
  });

  it("applyRemote merges remote upserts and deletes without an outbox", async () => {
    const storage = makeStorage({
      "or-zarua-remembrances": JSON.stringify([validRecord]),
    });
    const repo = createRemembranceRepository({ storage });
    await repo.applyRemote([
      { opId: "u1", recordId: "abc", deviceId: "other", version: { counter: 1, deviceId: "other" }, kind: "upsert", record: { ...validRecord, name: "Updated" } },
      { opId: "d1", recordId: "gone", deviceId: "other", version: { counter: 1, deviceId: "other" }, kind: "delete" },
    ]);
    const records = await repo.list();
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("Updated");
    expect(await repo.pendingChanges()).toEqual([]);
    expect(await repo.acknowledgeChanges(["u1", "d1"])).toBeUndefined();
  });

  it("getDeviceId is stable per storage and key", async () => {
    const storage = makeStorage();
    const repo = createRemembranceRepository({ storage });
    const first = await repo.getDeviceId();
    const second = await repo.getDeviceId();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("cursor defaults to zero and persists nothing", async () => {
    const repo = createRemembranceRepository({ storage: makeStorage() });
    expect(await repo.getCursor()).toEqual({ sequence: 0 });
    await repo.setCursor({ sequence: 9 });
    expect(await repo.getCursor()).toEqual({ sequence: 0 });
  });
});
