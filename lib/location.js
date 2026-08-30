import { httpJson } from "./http.js";

export const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
export const DEFAULT_LOCATION = { kind: "geonameid", id: "281184" };
export const DEFAULT_LOCATION_NAME = "Jerusalem, Israel";

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

export async function searchCityLocation(city, country, { signal } = {}) {
  const url = new URL(GEOCODING_API);
  url.search = new URLSearchParams({
    name: `${city}, ${country}`,
    count: "1",
    language: "en",
    format: "json",
  });
  const data = await httpJson(url, { signal, label: "City search" });
  const result = data.results?.[0];
  if (!result?.timezone) {
    throw new Error(`No city matching “${city}, ${country}” was found. Check the spelling and try again.`);
  }
  return {
    name: [result.name, result.admin1, result.country]
      .filter((part, index, values) => part && values.indexOf(part) === index)
      .join(", "),
    location: {
      kind: "coordinates",
      lat: result.latitude,
      lng: result.longitude,
      tzid: result.timezone,
    },
  };
}
