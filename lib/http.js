export async function httpJson(url, { signal, label = "The service" } = {}) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(`Could not reach ${label}. Check your connection and try again.`);
  }
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(`${label} is temporarily busy. Please wait a moment and try again.`);
    }
    throw new Error(`${label} could not complete this request (${response.status}).`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned an unexpected response. Please try again.`);
  }
}

export const API_ROOT = "https://www.hebcal.com";

export function hebcalUrl(path, params = {}) {
  const url = new URL(path, API_ROOT);
  Object.entries({ cfg: "json", ...params }).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  return url;
}

export async function hebcalJson(path, params, { signal } = {}) {
  return httpJson(hebcalUrl(path, params), { signal, label: "Hebcal" });
}

const converterCache = new Map();

export function converterCacheKey(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

export async function convert(params, { signal } = {}) {
  const key = converterCacheKey(params);
  if (converterCache.has(key)) return converterCache.get(key);
  const pending = hebcalJson("/converter", params, { signal }).catch((error) => {
    converterCache.delete(key);
    throw error;
  });
  converterCache.set(key, pending);
  return pending;
}

export function clearConverterCache() {
  converterCache.clear();
}
