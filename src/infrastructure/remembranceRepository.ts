/**
 * Web Storage-backed remembrance repository.
 *
 * Compatibility adapter for tests and callers that explicitly inject
 * Web Storage. It satisfies the async sync-aware port while preserving the
 * original validation behavior, but it is deliberately dumb about sync: it
 * keeps no outbox, tombstone, or cursor state. The production composition root
 * uses the IndexedDB repository instead.
 */
import { applyUpcomingPatches, assertWritableRemembrances, sanitizeRemembrances } from "../domain/remembrance";
import type { Remembrance, RemembranceRepository, StorageLike, SyncChange, SyncCursor } from "../application/ports";

export const REMEMBRANCE_STORAGE_KEY = "or-zarua-remembrances";

export function createRemembranceRepository({ storage = globalThis.localStorage, key = REMEMBRANCE_STORAGE_KEY }: { storage?: StorageLike; key?: string } = {}): RemembranceRepository {
  const deviceKey = `${key}:device-id`;

  async function list(): Promise<Remembrance[]> {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "[]") as unknown;
      if (!Array.isArray(parsed)) return [];
      return sanitizeRemembrances(parsed);
    } catch { return []; }
  }
  async function saveAll(records: Remembrance[]): Promise<Remembrance[]> {
    const safe = assertWritableRemembrances(records);
    try { storage.setItem(key, JSON.stringify(safe)); }
    catch (error) {
      if (error instanceof Error && error.name === "QuotaExceededError")
        throw new Error("This browser is out of space for saved remembrances. Export and remove a few.");
      throw new Error("Saved remembrances could not be written to this browser.");
    }
    return safe;
  }
  async function mergeUpcoming(updatesById: Map<string, Partial<Remembrance>>): Promise<Remembrance[]> {
    return saveAll(applyUpcomingPatches(await list(), updatesById));
  }
  async function applyRemote(changes: SyncChange[]): Promise<void> {
    const byId = new Map((await list()).map((row) => [row.id, row]));
    for (const change of changes) {
      if (change.kind === "upsert") byId.set(change.recordId, change.record);
      else byId.delete(change.recordId);
    }
    await saveAll([...byId.values()]);
  }
  function pendingChanges(): Promise<SyncChange[]> {
    return Promise.resolve([]);
  }
  function acknowledgeChanges(): Promise<void> {
    return Promise.resolve();
  }
  function getCursor(): Promise<SyncCursor> {
    return Promise.resolve({ sequence: 0 });
  }
  function setCursor(): Promise<void> {
    return Promise.resolve();
  }
  async function getDeviceId(): Promise<string> {
    const existing = storage.getItem(deviceKey);
    if (existing) return existing;
    const generated = (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto)
      ? globalThis.crypto.randomUUID()
      : `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    storage.setItem(deviceKey, generated);
    return generated;
  }
  return { list, saveAll, mergeUpcoming, applyRemote, pendingChanges, acknowledgeChanges, getCursor, setCursor, getDeviceId };
}
