import { formatGeocodeName } from "../domain/location.js";

export const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * Open-Meteo adapter implementing GeocoderPort.
 */
export function createOpenMeteoGeocoder({
  httpJson,
  endpoint = GEOCODING_API,
} = {}) {
  async function searchCity(city, country, { signal } = {}) {
    const url = new URL(endpoint);
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
      name: formatGeocodeName([result.name, result.admin1, result.country]),
      location: {
        kind: "coordinates",
        lat: result.latitude,
        lng: result.longitude,
        tzid: result.timezone,
      },
    };
  }

  return { searchCity };
}
