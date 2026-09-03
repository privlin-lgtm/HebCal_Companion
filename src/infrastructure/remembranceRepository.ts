import { applyUpcomingPatches, assertWritableRemembrances, sanitizeRemembrances } from "../domain/remembrance";
import type { Remembrance, RemembranceRepository, StorageLike } from "../application/ports";

export const REMEMBRANCE_STORAGE_KEY = "or-zarua-remembrances";

export function createRemembranceRepository({ storage = globalThis.localStorage, key = REMEMBRANCE_STORAGE_KEY }: { storage?: StorageLike; key?: string } = {}): RemembranceRepository {
  function list(): Remembrance[] {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "[]") as unknown;
      if (!Array.isArray(parsed)) return [];
      return sanitizeRemembrances(parsed);
    } catch { return []; }
  }
  function saveAll(records: Remembrance[]): Remembrance[] {
    const safe = assertWritableRemembrances(records);
    try { storage.setItem(key, JSON.stringify(safe)); }
    catch (error) {
      if (error instanceof Error && error.name === "QuotaExceededError")
        throw new Error("This browser is out of space for saved remembrances. Export and remove a few.");
      throw new Error("Saved remembrances could not be written to this browser.");
    }
    return safe;
  }
  function mergeUpcoming(updatesById: Map<string, Partial<Remembrance>>): Remembrance[] {
    return saveAll(applyUpcomingPatches(list(), updatesById));
  }
  return { list, saveAll, mergeUpcoming };
}