import type {
  CalendarPort,
  ConvertParams,
  ConvertResult,
  Location,
  RequestOptions,
  ShabbatPayload,
} from "../application/ports";
import { converterCacheKey } from "./hebcalCalendar";
import type { ResponseCache } from "./responseCache";

export function defaultLocationKey(location: Location): string {
  switch (location.kind) {
    case "geonameid":
      return `geonameid:${location.id}`;
    case "coordinates":
      return `coordinates:${location.lat},${location.lng},${location.tzid}`;
    case "zip":
      return `zip:${location.zip}`;
    case "city":
      return `city:${location.code}`;
    default: {
      const _exhaustive: never = location;
      return String(_exhaustive);
    }
  }
}

/**
 * CalendarPort decorator that persists successful Hebcal responses and
 * serves them with `_degraded: true` when the upstream call fails.
 */
export function createCachedCalendar({
  calendar,
  cache,
  locationKeyFn = defaultLocationKey,
}: {
  calendar: CalendarPort;
  cache: ResponseCache;
  locationKeyFn?: (location: Location) => string;
}): CalendarPort {
  async function convert(params: ConvertParams, options?: RequestOptions): Promise<ConvertResult> {
    const key = `convert:${converterCacheKey(params)}`;
    const result = await cache.wrapAsync(key, () => calendar.convert(params, options));
    return result as ConvertResult & { _degraded?: boolean };
  }

  async function getShabbat(location: Location, options?: RequestOptions): Promise<ShabbatPayload> {
    const key = `shabbat:${locationKeyFn(location)}`;
    return cache.wrapAsync(key, () => calendar.getShabbat(location, options));
  }

  return { convert, getShabbat };
}
