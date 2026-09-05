/**
 * IndexedDB-backed remembrance repository — the local source of truth.
 *
 * Active records live in the `records` store as `{ id, record, deleted,
 * version, order }` rows; removals stay behind as tombstones (`deleted: true`)
 * until every peer has observed them. Every local mutation is mirrored into
 * the `changes` outbox with a fresh Lamport version so the sync coordinator
 * can push it and acknowledge it later. Remote changes are applied through
 * `applyRemote`, which sorts by version, keeps only strictly newer changes,
 * advances the Lamport counter, and never writes to the outbox.
 *
 * On the first open of an empty database, valid records stored in the legacy
 * `or-zarua-remembrances` localStorage key are imported through the normal
 * local mutation path (so they receive outbox entries). The legacy key is
 * never deleted, and the migration marker is committed atomically with the
 * import so a failed import retries on the next open.
 */

import { applyUpcomingPatches, assertWritableRemembrances, sanitizeRemembrances } from "../domain/remembrance";
import type { Remembrance } from "../domain/remembrance";
import {
  compareSyncVersion,
  shouldApplyChange,
  type SyncChange,
  type SyncCursor,
  type SyncVersion,
} from "../domain/sync";
import type { Clock, IdGenerator, RemembranceRepository, StorageLike } from "../application/ports";
import {
  CHANGES_STORE,
  METADATA_STORE,
  PENDING_INDEX,
  RECORDS_STORE,
  openIndexedDb,
  runTransaction,
  storeDelete,
  storeGet,
  storeGetAll,
  storeGetAllFromIndex,
  storePut,
  type IndexedDbMetadataRow,
} from "./indexedDb";
import { REMEMBRANCE_STORAGE_KEY } from "./remembranceRepository";

const META_DEVICE_ID = "deviceId";
const META_LAMPORT = "lamport";
const META_ORDER = "order";
const META_CURSOR = "cursor";
const META_MIGRATION = "migrationLegacyV1";

type StoredRemembranceRow = {
  id: string;
  record: Remembrance | null;
  deleted: boolean;
  version: SyncVersion;
  order: number;
};

type StoredChangeRow = SyncChange & { pending: 0 };

async function readMeta(store: IDBObjectStore, key: string): Promise<unknown> {
  const row = await storeGet<IndexedDbMetadataRow>(store, key);
  return row?.value;
}

async function writeMeta(store: IDBObjectStore, key: string, value: unknown): Promise<void> {
  await storePut(store, { key, value });
}

async function readDeviceId(tx: IDBTransaction): Promise<string> {
  const value = await readMeta(tx.objectStore(METADATA_STORE), META_DEVICE_ID);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("The local sync device id is missing from the database.");
  }
  return value;
}

/** Reads the Lamport and insertion-order counters, tolerating a fresh store. */
async function readSyncState(tx: IDBTransaction): Promise<{ lamport: number; order: number }> {
  const metaStore = tx.objectStore(METADATA_STORE);
  const rawLamport = await readMeta(metaStore, META_LAMPORT);
  const rawOrder = await readMeta(metaStore, META_ORDER);
  let lamport = typeof rawLamport === "number" && Number.isFinite(rawLamport) ? rawLamport : 0;
  let order = typeof rawOrder === "number" && Number.isFinite(rawOrder) ? rawOrder : 0;
  if (order === 0) {
    const rows = await storeGetAll<StoredRemembranceRow>(tx.objectStore(RECORDS_STORE));
    for (const row of rows) order = Math.max(order, row.order);
  }
  return { lamport, order };
}

/** Stable outbox order: counter, then device id, then operation id. */
function compareChanges(a: SyncChange, b: SyncChange): number {
  const byVersion = compareSyncVersion(a.version, b.version);
  if (byVersion !== 0) return byVersion;
  if (a.opId < b.opId) return -1;
  if (a.opId > b.opId) return 1;
  return 0;
}

function sameRecord(a: Remembrance, b: Remembrance): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createIndexedDbRemembranceRepository({
  dbName,
  legacyStorage,
  ids,
  clock,
}: {
  dbName: string;
  legacyStorage: StorageLike;
  ids: IdGenerator;
  clock: Clock;
}): RemembranceRepository {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function ensureOpen(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = (async () => {
        const db = await openIndexedDb(dbName);
        await runTransaction(db, METADATA_STORE, "readwrite", async (tx) => {
          const existing = await readMeta(tx.objectStore(METADATA_STORE), META_DEVICE_ID);
          if (typeof existing !== "string" || existing.length === 0) {
            await writeMeta(tx.objectStore(METADATA_STORE), META_DEVICE_ID, ids.next());
          }
        });
        await migrateLegacy(db);
        return db;
      })().catch((error: unknown) => {
        // Reset so the next caller retries the whole open + migration.
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  }

  function readLegacyRemembrances(): Remembrance[] {
    const raw = legacyStorage.getItem(REMEMBRANCE_STORAGE_KEY);
    if (raw == null) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? sanitizeRemembrances(parsed) : [];
    } catch {
      return [];
    }
  }

  /**
   * One-time import of the legacy localStorage payload. Runs only on the first
   * open of an empty database; the marker is written in the same transaction
   * as the import so it never claims success before the records commit.
   */
  async function migrateLegacy(db: IDBDatabase): Promise<void> {
    const snapshot = await runTransaction(db, [METADATA_STORE, RECORDS_STORE], "readonly", async (tx) => {
      const migrated = await readMeta(tx.objectStore(METADATA_STORE), META_MIGRATION);
      const rows = await storeGetAll<StoredRemembranceRow>(tx.objectStore(RECORDS_STORE));
      return { migrated: migrated != null, empty: rows.length === 0 };
    });
    if (snapshot.migrated || !snapshot.empty) return;

    const legacy = readLegacyRemembrances();
    await runTransaction(db, [RECORDS_STORE, CHANGES_STORE, METADATA_STORE], "readwrite", async (tx) => {
      if (legacy.length) {
        await writeLocalChanges(tx, legacy);
      }
      await writeMeta(tx.objectStore(METADATA_STORE), META_MIGRATION, clock.now().toISOString());
    });
  }

  /**
   * Writes the given records as local mutations: diffs the current rows,
   * bumps the Lamport counter once per changed record, and appends matching
   * outbox changes — all inside the caller's transaction.
   */
  async function writeLocalChanges(tx: IDBTransaction, records: Remembrance[]): Promise<void> {
    const recordsStore = tx.objectStore(RECORDS_STORE);
    const changesStore = tx.objectStore(CHANGES_STORE);
    const metaStore = tx.objectStore(METADATA_STORE);
    const rows = await storeGetAll<StoredRemembranceRow>(recordsStore);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const deviceId = await readDeviceId(tx);
    const { lamport, order } = await readSyncState(tx);
    let counter = lamport;
    let nextOrder = order;
    const incomingIds = new Set(records.map((record) => record.id));

    for (const record of records) {
      const prior = byId.get(record.id);
      const priorRecord = prior && !prior.deleted ? prior.record : null;
      if (priorRecord != null && sameRecord(priorRecord, record)) continue;

      counter += 1;
      const version: SyncVersion = { counter, deviceId };
      const rowOrder = prior ? prior.order : (nextOrder += 1);
      await storePut(recordsStore, { id: record.id, record, deleted: false, version, order: rowOrder });
      await storePut(changesStore, {
        opId: ids.next(),
        recordId: record.id,
        deviceId,
        version,
        kind: "upsert",
        record,
        pending: 0,
      });
    }

    for (const row of rows) {
      if (row.deleted || incomingIds.has(row.id)) continue;
      counter += 1;
      const version: SyncVersion = { counter, deviceId };
      await storePut(recordsStore, { id: row.id, record: null, deleted: true, version, order: row.order });
      await storePut(changesStore, {
        opId: ids.next(),
        recordId: row.id,
        deviceId,
        version,
        kind: "delete",
        pending: 0,
      });
    }

    await writeMeta(metaStore, META_LAMPORT, counter);
    await writeMeta(metaStore, META_ORDER, nextOrder);
  }

  async function list(): Promise<Remembrance[]> {
    const db = await ensureOpen();
    return runTransaction(db, RECORDS_STORE, "readonly", async (tx) => {
      const rows = await storeGetAll<StoredRemembranceRow>(tx.objectStore(RECORDS_STORE));
      return rows
        .filter((row) => !row.deleted && row.record != null)
        .sort((a, b) => a.order - b.order)
        .map((row) => row.record as Remembrance);
    });
  }

  async function saveAll(records: Remembrance[]): Promise<Remembrance[]> {
    const safe = assertWritableRemembrances(records);
    const db = await ensureOpen();
    await runTransaction(db, [RECORDS_STORE, CHANGES_STORE, METADATA_STORE], "readwrite", (tx) =>
      writeLocalChanges(tx, safe),
    );
    return safe;
  }

  async function mergeUpcoming(updatesById: Map<string, Partial<Remembrance>>): Promise<Remembrance[]> {
    return saveAll(applyUpcomingPatches(await list(), updatesById));
  }

  async function applyRemote(changes: SyncChange[]): Promise<void> {
    if (!changes.length) return;
    const db = await ensureOpen();
    const sorted = [...changes].sort(compareChanges);
    await runTransaction(db, [RECORDS_STORE, METADATA_STORE], "readwrite", async (tx) => {
      const recordsStore = tx.objectStore(RECORDS_STORE);
      const metaStore = tx.objectStore(METADATA_STORE);
      const { lamport, order } = await readSyncState(tx);
      let counter = lamport;
      let nextOrder = order;

      for (const change of sorted) {
        counter = Math.max(counter, change.version.counter);
        const row = await storeGet<StoredRemembranceRow>(recordsStore, change.recordId);
        if (!shouldApplyChange(row?.version, change.version)) continue;

        if (change.kind === "upsert") {
          let record: Remembrance;
          try {
            record = assertWritableRemembrances([change.record])[0];
          } catch {
            throw new Error("A remote change carried an invalid remembrance and was rejected.");
          }
          const rowOrder = row ? row.order : (nextOrder += 1);
          await storePut(recordsStore, {
            id: change.recordId,
            record,
            deleted: false,
            version: change.version,
            order: rowOrder,
          });
        } else {
          // Tombstone — keeps the delete durable until every peer observes it.
          const rowOrder = row ? row.order : (nextOrder += 1);
          await storePut(recordsStore, {
            id: change.recordId,
            record: null,
            deleted: true,
            version: change.version,
            order: rowOrder,
          });
        }
      }

      await writeMeta(metaStore, META_LAMPORT, counter);
      await writeMeta(metaStore, META_ORDER, nextOrder);
    });
  }

  async function pendingChanges(): Promise<SyncChange[]> {
    const db = await ensureOpen();
    return runTransaction(db, CHANGES_STORE, "readonly", async (tx) => {
      const rows = await storeGetAllFromIndex<StoredChangeRow>(
        tx.objectStore(CHANGES_STORE),
        PENDING_INDEX,
        0,
      );
      const changes = rows.map((row): SyncChange =>
        row.kind === "upsert"
          ? { opId: row.opId, recordId: row.recordId, deviceId: row.deviceId, version: row.version, kind: "upsert", record: row.record }
          : { opId: row.opId, recordId: row.recordId, deviceId: row.deviceId, version: row.version, kind: "delete" },
      );
      return changes.sort(compareChanges);
    });
  }

  async function acknowledgeChanges(opIds: string[]): Promise<void> {
    if (!opIds.length) return;
    const db = await ensureOpen();
    await runTransaction(db, CHANGES_STORE, "readwrite", async (tx) => {
      const store = tx.objectStore(CHANGES_STORE);
      for (const opId of opIds) {
        await storeDelete(store, opId);
      }
    });
  }

  async function getCursor(): Promise<SyncCursor> {
    const db = await ensureOpen();
    return runTransaction(db, METADATA_STORE, "readonly", async (tx) => {
      const value = await readMeta(tx.objectStore(METADATA_STORE), META_CURSOR);
      const cursor = value as SyncCursor | null | undefined;
      if (cursor && Number.isInteger(cursor.sequence) && cursor.sequence >= 0) {
        return { sequence: cursor.sequence };
      }
      return { sequence: 0 };
    });
  }

  async function setCursor(cursor: SyncCursor): Promise<void> {
    const sequence = cursor?.sequence;
    if (!Number.isInteger(sequence) || (sequence as number) < 0) {
      throw new Error("The sync cursor must be a non-negative integer.");
    }
    const db = await ensureOpen();
    await runTransaction(db, METADATA_STORE, "readwrite", async (tx) => {
      await writeMeta(tx.objectStore(METADATA_STORE), META_CURSOR, { sequence });
    });
  }

  async function getDeviceId(): Promise<string> {
    const db = await ensureOpen();
    return runTransaction(db, METADATA_STORE, "readonly", (tx) => readDeviceId(tx));
  }

  return {
    list,
    saveAll,
    mergeUpcoming,
    applyRemote,
    pendingChanges,
    acknowledgeChanges,
    getCursor,
    setCursor,
    getDeviceId,
  };
}
