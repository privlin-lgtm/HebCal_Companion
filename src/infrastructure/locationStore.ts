import { isLocation } from "../domain/location";
import type { Location, LocationStore, StorageLike } from "../application/ports";

export const LOCATION_STORAGE_KEY = "or-zarua-last-location-v1";

/**
 * localStorage adapter implementing LocationStore.
 */
export function createLocationStore({
  storage = globalThis.localStorage,
  key = LOCATION_STORAGE_KEY,
}: {
  storage?: StorageLike;
  key?: string;
} = {}): LocationStore {
  function read() {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "null") as {
        name?: unknown;
        location?: unknown;
      } | null;
      if (!parsed || typeof parsed.name !== "string" || !isLocation(parsed.location)) return null;
      return { name: parsed.name, location: parsed.location };
    } catch {
      return null;
    }
  }

  function write(location: Location, name: string) {
    if (!isLocation(location) || typeof name !== "string") return;
    try {
      storage.setItem(key, JSON.stringify({ location, name }));
    } catch {
      // Location memory is optional.
    }
  }

  return { read, write };
}
