/** Hebcal REST API adapter — fallback for Shabbat times when local calc is insufficient. */
import type { CalendarPort, ConvertParams, ConvertResult, Location, RequestOptions, ShabbatPayload } from "../application/ports";
import { toHebcalParams } from "../domain/location";
import type { HttpJson } from "./httpClient";
import type { LearningView, LearningEntry } from "../domain/learning";

export const HEBCAL_API_ROOT = "https://www.hebcal.com";

export function buildHebcalUrl(path: string, params: Record<string, string | number | boolean | null | undefined> = {}, apiRoot = HEBCAL_API_ROOT): URL {
  const url = new URL(path, apiRoot);
  Object.entries({ cfg: "json", ...params }).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  });
  return url;
}

export function converterCacheKey(params: ConvertParams | Record<string, unknown>): string {
  return Object.keys(params).sort().map((key) => `${key}=${(params as Record<string, unknown>)[key]}`).join("&");
}

export function createHebcalApiCalendar({ httpJson, apiRoot = HEBCAL_API_ROOT, cache = new Map<string, Promise<ConvertResult>>() }: { httpJson: HttpJson; apiRoot?: string; cache?: Map<string, Promise<ConvertResult>> }): CalendarPort {
  async function request(path: string, params: Record<string, string | number | boolean | null | undefined>, { signal }: RequestOptions = {}) {
    return httpJson(buildHebcalUrl(path, params, apiRoot), { signal, label: "Hebcal" });
  }
  async function convert(params: ConvertParams, { signal }: RequestOptions = {}): Promise<ConvertResult> {
    const key = converterCacheKey(params);
    if (cache.has(key)) return cache.get(key)!;
    const pending = request("/converter", params as Record<string, string | number | boolean | null | undefined>, { signal })
      .then((data) => data as ConvertResult)
      .catch((error) => { cache.delete(key); throw error; });
    cache.set(key, pending);
    return pending;
  }
  async function getShabbat(location: Location, { signal }: RequestOptions = {}): Promise<ShabbatPayload> {
    return request("/shabbat", toHebcalParams(location), { signal }) as Promise<ShabbatPayload>;
  }
  async function getLearning(date?: string, _options?: RequestOptions): Promise<LearningView> {
    const d = date ? new Date(date) : new Date();
    const params = {
      gy: d.getFullYear(), gm: d.getMonth() + 1, gd: d.getDate(),
      dafyomi: 1, mishnaYomi: 1,
    };
    const data = await request("/hebcal", params, {}) as { items?: Array<{ category?: string; title?: string }> };
    const entries: LearningEntry[] = [];
    for (const item of data.items || []) {
      if (item.category === "dafyomi" && item.title) {
        entries.push({ track: "dafYomi", labelKey: "learning.dafYomi", description: item.title });
      }
      if (item.category === "mishnaYomi" && item.title) {
        entries.push({ track: "mishnaYomi", labelKey: "learning.mishnaYomi", description: item.title });
      }
    }
    return { date: d.toISOString().slice(0, 10), entries };
  }

  return { convert, getShabbat, getLearning };
}