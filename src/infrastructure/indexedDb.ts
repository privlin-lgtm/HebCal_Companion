/**
 * Minimal IndexedDB open, transaction, and store helpers for the local-first
 * remembrance store.
 *
 * Schema version 1 contains three stores:
 * - `records` (keyPath `id`): active remembrances plus `{ version, deleted }`
 *   metadata; deleted rows are kept as tombstones.
 * - `changes` (keyPath `opId`): the outbox of unacknowledged local changes.
 *   Every row carries `pending: 0` so the `pending` index can serve it.
 * - `metadata` (keyPath `key`): device id, Lamport counter, insertion-order
 *   counter, migration marker, and the pull cursor.
 *
 * Every transaction rejects on `error`/`abort`, and the connection is closed
 * when a `versionchange` request arrives from another tab.
 */

export const DATABASE_SCHEMA_VERSION = 1;

export const RECORDS_STORE = "records";
export const CHANGES_STORE = "changes";
export const METADATA_STORE = "metadata";

export const PENDING_INDEX = "pending";

export type IndexedDbMetadataRow = {
  key: string;
  value: unknown;
};

/** Resolves a request, rejecting with the underlying error when it fails. */
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("An IndexedDB request failed."));
  });
}

/**
 * Opens (and, on first use, creates) the database at schema version 1.
 *
 * The returned connection closes itself when another connection asks for a
 * schema upgrade, so an upgraded tab never leaves this one holding stale
 * object stores.
 */
export function openIndexedDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DATABASE_SCHEMA_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS_STORE)) {
        db.createObjectStore(RECORDS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHANGES_STORE)) {
        const changesStore = db.createObjectStore(CHANGES_STORE, { keyPath: "opId" });
        if (!changesStore.indexNames.contains(PENDING_INDEX)) {
          changesStore.createIndex(PENDING_INDEX, PENDING_INDEX);
        }
      }
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
    };

    request.onerror = () =>
      reject(request.error ?? new Error(`Could not open the "${dbName}" database.`));
    request.onblocked = () =>
      reject(new Error(`The "${dbName}" database upgrade is blocked by another tab.`));

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
  });
}

/**
 * Runs `work` inside a single transaction, resolving with its result only
 * after the transaction commits. Any failure — including an exception inside
 * `work` — aborts the transaction and rejects.
 */
export async function runTransaction<T>(
  db: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(storeNames, mode);
  const committed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("An IndexedDB transaction failed."));
    tx.onabort = () =>
      reject(tx.error ?? new Error("An IndexedDB transaction was aborted."));
  });
  let result: T;
  try {
    result = await work(tx);
    await committed;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // The transaction already finished; nothing left to abort.
    }
    // The abort/complete event settles `committed` asynchronously; swallow it
    // so the original error is the only rejection surface.
    await committed.catch(() => undefined);
    throw error;
  }
  return result;
}

/* -------- single-request store helpers -------- */

export function storeGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return requestResult(store.get(key)) as Promise<T | undefined>;
}

export function storePut(store: IDBObjectStore, value: unknown): Promise<IDBValidKey> {
  return requestResult(store.put(value));
}

export function storeDelete(store: IDBObjectStore, key: IDBValidKey): Promise<undefined> {
  return requestResult(store.delete(key));
}

export function storeGetAll<T>(store: IDBObjectStore): Promise<T[]> {
  return requestResult(store.getAll()) as Promise<T[]>;
}

export function storeGetAllFromIndex<T>(
  store: IDBObjectStore,
  indexName: string,
  key?: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const index = store.index(indexName);
  return requestResult(key === undefined ? index.getAll() : index.getAll(key)) as Promise<T[]>;
}

/**
 * Deletes every row matched by `predicate` with a cursor, so a potentially
 * large deletion still happens inside one transaction. Returns the count.
 */
export async function storeDeleteWhere(
  store: IDBObjectStore,
  predicate: (value: unknown) => boolean,
): Promise<number> {
  let deleted = 0;
  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      if (predicate(cursor.value)) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
    request.onerror = () =>
      reject(request.error ?? new Error("An IndexedDB cursor failed."));
  });
  return deleted;
}
