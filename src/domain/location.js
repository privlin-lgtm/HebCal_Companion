/** Location value object — no I/O. */

export const DEFAULT_LOCATION = Object.freeze({ kind: "geonameid", id: "281184" });
export const DEFAULT_LOCATION_NAME = "Jerusalem, Israel";

export function isLocation(value) {
  if (!value || typeof value !== "object") return false;
  if (value.kind === "geonameid") return typeof value.id === "string" && value.id.length > 0;
  if (value.kind === "coordinates") {
    return Number.isFinite(value.lat) && Number.isFinite(value.lng) && typeof value.tzid === "string";
  }
  if (value.kind === "zip") return typeof value.zip === "string" && /^\d{5}(?:-\d{4})?$/.test(value.zip);
  if (value.kind === "city") return typeof value.code === "string" && value.code.length > 0;
  return false;
}

export function toHebcalParams(location) {
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

export function parseDirectLocation(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (/^\d{5}(?:-\d{4})?$/.test(trimmed)) return { kind: "zip", zip: trimmed };
  return { kind: "city", code: trimmed };
}

export function formatGeocodeName(parts) {
  return parts.filter((part, index, values) => part && values.indexOf(part) === index).join(", ");
}
