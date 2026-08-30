import type { CityLocation, CoordinatesLocation, GeonameLocation, Location, ZipLocation } from "../application/ports";

/** Location value object — no I/O. */

export const DEFAULT_LOCATION: GeonameLocation = Object.freeze({ kind: "geonameid", id: "281184" });
export const DEFAULT_LOCATION_NAME = "Jerusalem, Israel";

export type HebcalLocationParams =
  | { geonameid: string }
  | { latitude: number; longitude: number; tzid: string }
  | { zip: string }
  | { city: string };

export function isLocation(value: unknown): value is Location {
  if (!value || typeof value !== "object") return false;
  const loc = value as Partial<Location> & { kind?: string };
  if (loc.kind === "geonameid") {
    return typeof (loc as GeonameLocation).id === "string" && (loc as GeonameLocation).id.length > 0;
  }
  if (loc.kind === "coordinates") {
    const c = loc as CoordinatesLocation;
    return Number.isFinite(c.lat) && Number.isFinite(c.lng) && typeof c.tzid === "string";
  }
  if (loc.kind === "zip") {
    return typeof (loc as ZipLocation).zip === "string" && /^\d{5}(?:-\d{4})?$/.test((loc as ZipLocation).zip);
  }
  if (loc.kind === "city") {
    return typeof (loc as CityLocation).code === "string" && (loc as CityLocation).code.length > 0;
  }
  return false;
}

export function toHebcalParams(location: Location | null | undefined): HebcalLocationParams {
  switch (location?.kind) {
    case "geonameid":
      return { geonameid: location.id };
    case "coordinates":
      return { latitude: location.lat, longitude: location.lng, tzid: location.tzid };
    case "zip":
      return { zip: location.zip };
    case "city":
      return { city: location.code };
    default:
      throw new Error("Choose a city, a US ZIP code, or a Hebcal city code.");
  }
}

export function parseDirectLocation(value: string | null | undefined): ZipLocation | CityLocation | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (/^\d{5}(?:-\d{4})?$/.test(trimmed)) return { kind: "zip", zip: trimmed };
  return { kind: "city", code: trimmed };
}

export function formatGeocodeName(parts: Array<string | null | undefined>): string {
  return parts.filter((part, index, values) => part && values.indexOf(part) === index).join(", ");
}
