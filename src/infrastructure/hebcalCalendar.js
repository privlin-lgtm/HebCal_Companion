import { toHebcalParams } from "../domain/location.js";

export const HEBCAL_API_ROOT = "https://www.hebcal.com";

export function buildHebcalUrl(path, params = {}, apiRoot = HEBCAL_API_ROOT) {
  const url = new URL(path, apiRoot);
  Object.entries({ cfg: "json", ...params }).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  return url;
}

export function converterCacheKey(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

/**
 * Hebcal adapter implementing CalendarPort.
 * @param {{ httpJson: Function, apiRoot?: string, cache?: Map }} deps
 */
export function createHebcalCalendar({
  httpJson,
  apiRoot = HEBCAL_API_ROOT,
  cache = new Map(),
} = {}) {
  async function request(path, params, { signal } = {}) {
    return httpJson(buildHebcalUrl(path, params, apiRoot), { signal, label: "Hebcal" });
  }

  async function convert(params, { signal } = {}) {
    const key = converterCacheKey(params);
    if (cache.has(key)) return cache.get(key);
    const pending = request("/converter", params, { signal }).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
    return pending;
  }

  async function getShabbat(location, { signal } = {}) {
    return request("/shabbat", toHebcalParams(location), { signal });
  }

  function clearCache() {
    cache.clear();
  }

  return { convert, getShabbat, clearCache };
}
