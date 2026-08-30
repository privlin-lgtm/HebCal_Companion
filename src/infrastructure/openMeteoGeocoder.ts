import { formatGeocodeName } from "../domain/location";
import type { CoordinatesLocation, GeocoderPort, RequestOptions } from "../application/ports";
import type { HttpJson } from "./httpClient";

export const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";

type GeocodeResult = {
  name?: string;
  admin1?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
};

/**
 * Open-Meteo adapter implementing GeocoderPort.
 */
export function createOpenMeteoGeocoder({
  httpJson,
  endpoint = GEOCODING_API,
}: {
  httpJson: HttpJson;
  endpoint?: string;
}): GeocoderPort {
  async function searchCity(city: string, country: string, { signal }: RequestOptions = {}) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      name: `${city}, ${country}`,
      count: "1",
      language: "en",
      format: "json",
    }).toString();
    const data = await httpJson(url, { signal, label: "City search" }) as { results?: GeocodeResult[] };
    const result = data.results?.[0];
    if (!result?.timezone || result.latitude == null || result.longitude == null) {
      throw new Error(`No city matching “${city}, ${country}” was found. Check the spelling and try again.`);
    }
    const location: CoordinatesLocation = {
      kind: "coordinates",
      lat: result.latitude,
      lng: result.longitude,
      tzid: result.timezone,
    };
    return {
      name: formatGeocodeName([result.name, result.admin1, result.country]),
      location,
    };
  }

  return { searchCity };
}
