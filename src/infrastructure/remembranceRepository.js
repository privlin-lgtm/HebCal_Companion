import {
  applyUpcomingPatches,
  assertWritableRemembrances,
  sanitizeRemembrances,
} from "../domain/remembrance.js";

export const REMEMBRANCE_STORAGE_KEY = "or-zarua-remembrances-v1";

/**
 * localStorage adapter implementing RemembranceRepository.
 */
export function createRemembranceRepository({
  storage = globalThis.localStorage,
  key = REMEMBRANCE_STORAGE_KEY,
} = {}) {
  function list() {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "[]");
      if (!Array.isArray(parsed)) return [];
      return sanitizeRemembrances(parsed);
    } catch {
      return [];
    }
  }

  function saveAll(records) {
    const safe = assertWritableRemembrances(records);
    try {
      storage.setItem(key, JSON.stringify(safe));
    } catch (error) {
      if (error.name === "QuotaExceededError") {
        throw new Error("This browser is out of space for saved remembrances. Export and remove a few.");
      }
      throw new Error("Saved remembrances could not be written to this browser.");
    }
    return safe;
  }

  function mergeUpcoming(updatesById) {
    return saveAll(applyUpcomingPatches(list(), updatesById));
  }

  return { list, saveAll, mergeUpcoming };
}
