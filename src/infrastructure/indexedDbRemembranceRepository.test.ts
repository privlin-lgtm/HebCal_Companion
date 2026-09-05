import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import { createIndexedDbRemembranceRepository } from "./indexedDbRemembranceRepository";
import { REMEMBRANCE_STORAGE_KEY } from "./remembranceRepository";
import type { Clock, IdGenerator, Remembrance, StorageLike, SyncChange } from "../application/ports";

let dbCounter = 0;
function makeDbName(): string {
  return `idb-remembrance-${Date.now()}-${++dbCounter}`;
}

function makeStorage(initial: Record<string, string> = {}): StorageLike {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => { data[key] = value; },
  };
}

function makeIds(): IdGenerator {
  let n = 0;
  return { next: () => `op-${++n}` };
}

function makeClock(): Clock {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return { now: () => now, todayIso: () => "2026-01-01" };
}

function makeRepo(options: { dbName?: string; storage?: StorageLike } = {}) {
  return createIndexedDbRemembranceRepository({
    dbName: options.dbName ?? makeDbName(),
    legacyStorage: options.storage ?? makeStorage(),
    ids: makeIds(),
    clock: makeClock(),
  });
}

const validRecord: Remembrance = {
  id: "abc",
  name: "Test Person",
  type: "Yahrzeit",
  hy: 5786,
  hm: "Tishrei",
  hd: 1,
  originalDate: "2025-09-23",
};

function peerUpsert(overrides: Partial<Extract<SyncChange, { kind: "upsert" }>>): SyncChange {
  return {
    opId: "remote-op",
    recordId: validRecord.id,
    deviceId: "remote-device",
    version: { counter: 99, deviceId: "remote-device" },
    kind: "upsert",
    record: validRecord,
    ...overrides,
  };
}

describe("createIndexedDbRemembranceRepository", () => {
  it("imports valid legacy localStorage records once and leaves the legacy key intact", async () => {
    const dbName = makeDbName();
    const storage = makeStorage({ [REMEMBRANCE_STORAGE_KEY]: JSON.stringify([validRecord]) });
    const repo = makeRepo({ dbName, storage });

    const records = await repo.list();
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("Test Person");

    // The legacy key is never deleted: rollback and recovery stay possible.
    expect(storage.getItem(REMEMBRANCE_STORAGE_KEY)).not.toBeNull();

    // Imported through the normal local mutation path, so it got an outbox entry.
    const pending = await repo.pendingChanges();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ recordId: "abc", kind: "upsert", version: { counter: 1 } });

    // Reopening the same database must not import a second copy.
    const reopened = makeRepo({ dbName, storage });
    expect(await reopened.list()).toHaveLength(1);
    expect(await reopened.pendingChanges()).toHaveLength(1);
  });

  it("ignores corrupt or non-array legacy data", async () => {
    const repo = makeRepo({ storage: makeStorage({ [REMEMBRANCE_STORAGE_KEY]: "{not json" }) });
    expect(await repo.list()).toEqual([]);
    expect(await repo.pendingChanges()).toEqual([]);
  });

  it("never overwrites newer local data with legacy storage", async () => {
    const dbName = makeDbName();
    const repo = makeRepo({ dbName, storage: makeStorage() });
    await repo.saveAll([{ ...validRecord, name: "Local Only" }]);

    // Legacy data appears later; the already-populated database must keep it out.
    const later = makeRepo({
      dbName,
      storage: makeStorage({ [REMEMBRANCE_STORAGE_KEY]: JSON.stringify([validRecord]) }),
    });
    const records = await later.list();
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("Local Only");
  });

  it("creates one outbox upsert with a Lamport version for a new remembrance", async () => {
    const repo = makeRepo();
    await repo.saveAll([validRecord]);

    const pending = await repo.pendingChanges();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      recordId: "abc",
      kind: "upsert",
      version: { counter: 1, deviceId: await repo.getDeviceId() },
    });

    const records = await repo.list();
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("Test Person");
  });

  it("orders outbox changes by counter and keeps reassignments out", async () => {
    const repo = makeRepo();
    await repo.saveAll([validRecord]);
    await repo.saveAll([validRecord, { ...validRecord, id: "def", name: "Second" }]);
    const pending = await repo.pendingChanges();
    expect(pending.map((c) => c.version.counter)).toEqual([1, 2]);
    expect(pending.map((c) => c.recordId)).toEqual(["abc", "def"]);
  });

  it("keeps list in first-insertion order across updates and appends", async () => {
    const repo = makeRepo();
    const second = { ...validRecord, id: "def", name: "Second" };
    const third = { ...validRecord, id: "ghi", name: "Third" };
    await repo.saveAll([validRecord]);
    await repo.saveAll([validRecord, second]);
    await repo.saveAll([validRecord, second, third]);

    // Updating an existing record must not move it.
    await repo.saveAll([{ ...validRecord, name: "Test Person (updated)" }, second, third]);

    expect((await repo.list()).map((r) => r.id)).toEqual(["abc", "def", "ghi"]);
    expect((await repo.list()).map((r) => r.name)).toEqual([
      "Test Person (updated)", "Second", "Third",
    ]);
  });

  it("creates a delete tombstone when a saved record disappears", async () => {
    const repo = makeRepo();
    const second = { ...validRecord, id: "def", name: "Second" };
    await repo.saveAll([validRecord, second]);
    await repo.saveAll([validRecord]); // def disappears

    const pending = await repo.pendingChanges();
    const deletes = pending.filter((c) => c.kind === "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatchObject({ recordId: "def", kind: "delete" });

    expect((await repo.list()).map((r) => r.id)).toEqual(["abc"]);
  });

  it("does not enqueue changes when applying a remote change", async () => {
    const repo = makeRepo();
    await repo.saveAll([validRecord]);

    await repo.applyRemote([
      peerUpsert({ record: { ...validRecord, name: "Updated Name" } }),
      peerUpsert({
        opId: "remote-new",
        recordId: "remote-new-id",
        record: { ...validRecord, id: "remote-new-id", name: "From Remote" },
        version: { counter: 100, deviceId: "remote-device" },
      }),
    ]);

    let records = await repo.list();
    expect(records.map((r) => r.id)).toEqual(["abc", "remote-new-id"]);
    expect(records[0].name).toBe("Updated Name");

    // The outbox still holds only the original local upsert.
    const pending = await repo.pendingChanges();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ recordId: "abc", kind: "upsert" });

    // Re-applying the same batch (idempotent replay) changes nothing.
    await repo.applyRemote([
      peerUpsert({ record: { ...validRecord, name: "Updated Name" } }),
      peerUpsert({
        opId: "remote-new",
        recordId: "remote-new-id",
        record: { ...validRecord, id: "remote-new-id", name: "From Remote" },
        version: { counter: 100, deviceId: "remote-device" },
      }),
    ]);
    records = await repo.list();
    expect(records.map((r) => r.id)).toEqual(["abc", "remote-new-id"]);
    expect(await repo.pendingChanges()).toHaveLength(1);
  });

  it("applies only strictly newer remote changes", async () => {
    const repo = makeRepo();
    await repo.saveAll([validRecord]);
    await repo.applyRemote([peerUpsert({ record: { ...validRecord, name: "Newest" } })]);

    // Older version must not overwrite.
    await repo.applyRemote([
      peerUpsert({ record: { ...validRecord, name: "Older" }, version: { counter: 50, deviceId: "other-peer" } }),
    ]);
    expect((await repo.list())[0].name).toBe("Newest");
  });

  it("keeps a remote delete as a durable tombstone that blocks resurrection", async () => {
    const repo = makeRepo();
    await repo.saveAll([validRecord]);

    await repo.applyRemote([
      { opId: "remote-delete", recordId: "abc", deviceId: "remote-device", version: { counter: 200, deviceId: "remote-device" }, kind: "delete" },
    ]);
    expect(await repo.list()).toEqual([]);

    // An older remote upsert must not resurrect the deleted record.
    await repo.applyRemote([peerUpsert({ record: { ...validRecord, name: "Resurrected" }, version: { counter: 100, deviceId: "remote-device" } })]);
    expect(await repo.list()).toEqual([]);
  });

  it("advances the Lamport counter to at least the incoming remote counter", async () => {
    const repo = makeRepo();
    await repo.saveAll([validRecord]); // counter 1
    // Remote change with identical content but a higher version.
    await repo.applyRemote([peerUpsert({ version: { counter: 42, deviceId: "remote-device" } })]);

    await repo.saveAll([validRecord, { ...validRecord, id: "def", name: "Second" }]);
    const pending = await repo.pendingChanges();
    const local = pending.filter((c) => c.recordId === "def");
    expect(local[0].version.counter).toBe(43);
  });

  it("acknowledges only the requested operation ids", async () => {
    const repo = makeRepo();
    await repo.saveAll([
      validRecord,
      { ...validRecord, id: "def", name: "Second" },
      { ...validRecord, id: "ghi", name: "Third" },
    ]);

    let pending = await repo.pendingChanges();
    expect(pending).toHaveLength(3);

    await repo.acknowledgeChanges([pending[1].opId]);
    pending = await repo.pendingChanges();
    expect(pending.map((c) => c.version.counter)).toEqual([1, 3]);

    // Acknowledging an already-acknowledged id is a safe no-op.
    await repo.acknowledgeChanges([pending[1].opId]);
    pending = await repo.pendingChanges();
    expect(pending.map((c) => c.version.counter)).toEqual([1]);
  });

  it("persists the pull cursor transactionally", async () => {
    const repo = makeRepo();
    expect(await repo.getCursor()).toEqual({ sequence: 0 });

    await repo.setCursor({ sequence: 7 });
    expect(await repo.getCursor()).toEqual({ sequence: 7 });

    await expect(repo.setCursor({ sequence: -1 })).rejects.toThrow();
    await expect(repo.setCursor({ sequence: 1.5 })).rejects.toThrow();
    expect(await repo.getCursor()).toEqual({ sequence: 7 });
  });

  it("generates a device id once and persists it across connections", async () => {
    const dbName = makeDbName();
    const repo = makeRepo({ dbName });
    const first = await repo.getDeviceId();
    const second = await repo.getDeviceId();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);

    const reopened = makeRepo({ dbName });
    expect(await reopened.getDeviceId()).toBe(first);
  });

  it("mergeUpcoming patches matching records and outboxes the change", async () => {
    const repo = makeRepo();
    await repo.saveAll([validRecord]);

    const updates = new Map([
      ["abc", { nextIso: "2026-09-23", nextFormatted: "Wed Sep 23" }],
      ["missing", { nextIso: "2027-01-01" }],
    ]);
    const result = await repo.mergeUpcoming(updates);
    expect(result).toHaveLength(1);
    expect(result[0].nextIso).toBe("2026-09-23");

    const records = await repo.list();
    expect(records[0].nextFormatted).toBe("Wed Sep 23");

    const pending = await repo.pendingChanges();
    expect(pending).toHaveLength(2); // original save + the patch
    expect(pending[1]).toMatchObject({ recordId: "abc", kind: "upsert" });
  });

  it("rejects an invalid remote payload without applying anything", async () => {
    const repo = makeRepo();
    await repo.saveAll([validRecord]);

    await expect(
      repo.applyRemote([
        peerUpsert({ record: { ...validRecord, name: "" } }),
        peerUpsert({ opId: "remote-b", recordId: "other", record: { ...validRecord, id: "other", name: "Should Not Land" } }),
      ]),
    ).rejects.toThrow();

    const records = await repo.list();
    expect(records).toHaveLength(1);
    expect(records.map((r) => r.id)).toEqual(["abc"]);
  });
});
