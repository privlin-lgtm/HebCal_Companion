import { isLocation, type Location, type SavedLocation } from "../domain/location";
import type { MultiLocationStore, StorageLike, IdGenerator } from "../application/ports";

const MULTI_LOCATION_KEY = "or-zarua-locations";

export function createMultiLocationStore({
  storage = globalThis.localStorage,
  ids,
  key = MULTI_LOCATION_KEY,
}: {
  storage?: StorageLike;
  ids: IdGenerator;
  key?: string;
}): MultiLocationStore {
  function readRaw(): SavedLocation[] {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "[]") as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is SavedLocation => {
        if (!item || typeof item !== "object") return false;
        const s = item as Partial<SavedLocation>;
        return typeof s.id === "string" && typeof s.name === "string" && isLocation(s.location);
      });
    } catch {
      return [];
    }
  }

  function writeRaw(locations: SavedLocation[]): void {
    try {
      storage.setItem(key, JSON.stringify(locations));
    } catch {
      // Best-effort storage
    }
  }

  function list(): SavedLocation[] {
    return readRaw();
  }

  function add(name: string, location: Location): SavedLocation {
    const locations = readRaw();
    // Check if this location already exists (by locationKey comparison)
    const existing = locations.find((s) => sameLocation(s.location, location));
    if (existing) return existing;

    const isFirst = locations.length === 0;
    const saved: SavedLocation = { id: ids.next(), name, location, isDefault: isFirst };
    locations.push(saved);
    writeRaw(locations);
    return saved;
  }

  function remove(id: string): SavedLocation[] {
    let locations = readRaw().filter((s) => s.id !== id);
    // If we removed the default, make the first one default
    if (locations.length > 0 && !locations.some((s) => s.isDefault)) {
      locations[0].isDefault = true;
      writeRaw(locations);
    } else {
      writeRaw(locations);
    }
    return locations;
  }

  function setDefault(id: string): SavedLocation[] {
    const locations = readRaw().map((s) => ({ ...s, isDefault: s.id === id }));
    writeRaw(locations);
    return locations;
  }

  function getDefault(): SavedLocation | null {
    const locations = readRaw();
    return locations.find((s) => s.isDefault) || locations[0] || null;
  }

  return { list, add, remove, setDefault, getDefault };
}

function sameLocation(a: Location, b: Location): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "geonameid":
      return a.id === (b as typeof a).id;
    case "coordinates": {
      const c = b as typeof a;
      return a.lat === c.lat && a.lng === c.lng && a.tzid === c.tzid;
    }
    case "zip":
      return a.zip === (b as typeof a).zip;
    case "city":
      return a.code === (b as typeof a).code;
    default:
      return false;
  }
}
