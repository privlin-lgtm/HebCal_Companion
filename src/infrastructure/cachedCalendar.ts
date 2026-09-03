import type { CalendarPort, ConvertParams, ConvertResult, Location, RequestOptions, ShabbatPayload } from "../application/ports";
import { converterCacheKey } from "./hebcalApi";
import type { ResponseCache } from "./responseCache";
import { locationKey } from "../domain/location";

export function createCachedCalendar({ calendar, cache }: { calendar: CalendarPort; cache: ResponseCache }): CalendarPort {
  async function convert(params: ConvertParams, options?: RequestOptions): Promise<ConvertResult> {
    const key = `convert:${converterCacheKey(params)}`;
    const result = await cache.wrapAsync(key, () => calendar.convert(params, options));
    return result as ConvertResult & { _degraded?: boolean };
  }
  async function getShabbat(location: Location, options?: RequestOptions): Promise<ShabbatPayload> {
    const key = `shabbat:${locationKey(location)}`;
    return cache.wrapAsync(key, () => calendar.getShabbat(location, options));
  }
  return { convert, getShabbat };
}