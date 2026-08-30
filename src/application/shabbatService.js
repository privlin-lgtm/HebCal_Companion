import { projectShabbat } from "../domain/calendar.js";
import { DEFAULT_LOCATION, DEFAULT_LOCATION_NAME } from "../domain/location.js";

/**
 * Application service for Shabbat times.
 * Depends on CalendarPort + GeocoderPort + LocationStore (injected).
 */
export function createShabbatService({
  calendar,
  geocoder,
  locationStore,
  defaults = { location: DEFAULT_LOCATION, name: DEFAULT_LOCATION_NAME },
}) {
  async function load(location, fallbackName, { signal } = {}) {
    const data = await calendar.getShabbat(location, { signal });
    const view = projectShabbat(data, fallbackName);
    locationStore.write(location, view.place);
    return view;
  }

  async function searchAndLoad(city, country, { signal } = {}) {
    const found = await geocoder.searchCity(city, country, { signal });
    const view = await load(found.location, found.name, { signal });
    return { ...view, location: found.location };
  }

  function initialSelection() {
    return locationStore.read() || { location: defaults.location, name: defaults.name };
  }

  return {
    load,
    searchAndLoad,
    initialSelection,
  };
}
