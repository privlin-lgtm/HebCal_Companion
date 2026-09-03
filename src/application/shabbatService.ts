import type { CalendarPort, GeocoderPort, Location, LocationStore, RequestOptions, ShabbatView } from "./ports";
import { projectShabbat } from "../domain/calendar";
import { DEFAULT_LOCATION, DEFAULT_LOCATION_NAME } from "../domain/location";

export type ShabbatService = {
  load(location: Location, fallbackName: string, options?: RequestOptions): Promise<ShabbatView>;
  searchAndLoad(city: string, country: string, options?: RequestOptions): Promise<ShabbatView & { location: Location }>;
  initialSelection(): { location: Location; name: string };
};

export function createShabbatService({ calendar, geocoder, locationStore, defaults = { location: DEFAULT_LOCATION, name: DEFAULT_LOCATION_NAME } }: {
  calendar: CalendarPort; geocoder: GeocoderPort; locationStore: LocationStore;
  defaults?: { location: Location; name: string };
}): ShabbatService {
  async function load(location: Location, fallbackName: string, { signal }: RequestOptions = {}) {
    const data = await calendar.getShabbat(location, { signal });
    const view = projectShabbat(data, fallbackName);
    locationStore.write(location, view.place);
    return view;
  }
  async function searchAndLoad(city: string, country: string, { signal }: RequestOptions = {}) {
    const found = await geocoder.searchCity(city, country, { signal });
    const view = await load(found.location, found.name, { signal });
    return { ...view, location: found.location };
  }
  function initialSelection() {
    return locationStore.read() || { location: defaults.location, name: defaults.name };
  }
  return { load, searchAndLoad, initialSelection };
}