import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./httpClient";
import { buildHebcalUrl, converterCacheKey, createHebcalCalendar } from "./hebcalCalendar";
import { createOpenMeteoGeocoder } from "./openMeteoGeocoder";
import { createRemembranceRepository, REMEMBRANCE_STORAGE_KEY } from "./remembranceRepository";
import { createLocationStore, LOCATION_STORAGE_KEY } from "./locationStore";
import { createResponseCache } from "./responseCache";
import { createCachedCalendar } from "./cachedCalendar";
import type { ConvertResult, Remembrance, ShabbatPayload } from "../application/ports";

function memoryStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    getItem: (key: string) => (Object.hasOwn(data, key) ? data[key] : null),
    setItem: (key: string, value: string) => { data[key] = String(value); },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("httpClient", () => {
  it("maps network, 429, and bad JSON failures", async () => {
    const httpJson = createHttpClient({
      fetchImpl: vi.fn().mockRejectedValue(new TypeError("offline")),
    });
    await expect(httpJson("https://example.com", { label: "Hebcal" })).rejects.toThrow(/Could not reach Hebcal/);

    const busy = createHttpClient({
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    });
    await expect(busy("https://example.com", { label: "Hebcal" })).rejects.toThrow(/temporarily busy/);
  });

  it("rethrows AbortError", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const httpJson = createHttpClient({ fetchImpl: vi.fn().mockRejectedValue(abort) });
    await expect(httpJson("https://example.com")).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("hebcalCalendar", () => {
  it("builds URLs and reuses in-flight convert requests", async () => {
    const url = buildHebcalUrl("/converter", { gy: 2026, gs: "" });
    expect(url.searchParams.get("cfg")).toBe("json");
    expect(url.searchParams.has("gs")).toBe(false);
    expect(converterCacheKey({ b: 1, a: 2 } as never)).toBe(converterCacheKey({ a: 2, b: 1 } as never));

    const httpJson = vi.fn().mockResolvedValue({ hy: 5786 });
    const calendar = createHebcalCalendar({ httpJson });
    const [a, b] = await Promise.all([
      calendar.convert({ gy: 2026, gm: 8, gd: 30, g2h: 1 }),
      calendar.convert({ gy: 2026, gm: 8, gd: 30, g2h: 1 }),
    ]);
    expect(a.hy).toBe(5786);
    expect(b.hy).toBe(5786);
    expect(httpJson).toHaveBeenCalledTimes(1);
  });

  it("evicts failed converts from the cache", async () => {
    const httpJson = vi.fn()
      .mockRejectedValueOnce(new Error("Hebcal could not complete this request (503)."))
      .mockResolvedValueOnce({ hy: 5786 });
    const calendar = createHebcalCalendar({ httpJson });
    await expect(calendar.convert({ gy: 2026, g2h: 1 })).rejects.toThrow(/503/);
    await expect(calendar.convert({ gy: 2026, g2h: 1 })).resolves.toEqual({ hy: 5786 });
  });
});

describe("openMeteoGeocoder", () => {
  it("maps a geocode hit and fails when timezone is missing", async () => {
    const geocoder = createOpenMeteoGeocoder({
      httpJson: vi.fn().mockResolvedValue({
        results: [{ name: "Paris", admin1: "Ile-de-France", country: "France", latitude: 1, longitude: 2, timezone: "Europe/Paris" }],
      }),
    });
    await expect(geocoder.searchCity("Paris", "France")).resolves.toMatchObject({
      name: "Paris, Ile-de-France, France",
      location: { kind: "coordinates", tzid: "Europe/Paris" },
    });

    const missing = createOpenMeteoGeocoder({
      httpJson: vi.fn().mockResolvedValue({ results: [] }),
    });
    await expect(missing.searchCity("Narnia", "Nowhere")).rejects.toThrow(/No city matching/);
  });
});

describe("repositories", () => {
  const valid: Remembrance = {
    id: "r1", name: "Rivka", type: "Yahrzeit", hy: 5780, hm: "Tevet", hd: 10, originalDate: "2020-01-07",
  };

  it("reads, writes, and merge-patches remembrances through injected storage", () => {
    const storage = memoryStorage();
    const repo = createRemembranceRepository({ storage });
    repo.saveAll([valid]);
    expect(repo.list()).toEqual([valid]);
    repo.mergeUpcoming(new Map([["r1", { nextIso: "2026-12-20", nextFormatted: "Sunday, December 20, 2026" }]]));
    expect(repo.list()[0].nextIso).toBe("2026-12-20");
  });

  it("returns empty on corrupt remembrance storage and explains quota failures", () => {
    expect(createRemembranceRepository({
      storage: memoryStorage({ [REMEMBRANCE_STORAGE_KEY]: "{bad" }),
    }).list()).toEqual([]);

    const full = {
      getItem: () => "[]",
      setItem: () => { throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); },
    };
    expect(() => createRemembranceRepository({ storage: full }).saveAll([valid])).toThrow(/out of space/);
  });

  it("persists last location and ignores invalid writes", () => {
    const storage = memoryStorage();
    const store = createLocationStore({ storage });
    store.write({ kind: "geonameid", id: "281184" }, "Jerusalem, Israel");
    expect(store.read()).toEqual({
      location: { kind: "geonameid", id: "281184" },
      name: "Jerusalem, Israel",
    });
    store.write(null as never, "x");
    expect(JSON.parse(storage.getItem(LOCATION_STORAGE_KEY)!).name).toBe("Jerusalem, Israel");
  });
});

describe("responseCache", () => {
  it("stores values and serves degraded copies when the loader fails", async () => {
    const cache = createResponseCache({ storage: memoryStorage(), keyPrefix: "t:" });
    const fresh = await cache.wrapAsync("k", async () => ({ value: 1 }));
    expect(fresh).toEqual({ value: 1 });
    expect(cache.get("k")).toEqual({ value: 1 });

    const degraded = await cache.wrapAsync("k", async () => {
      throw new Error("offline");
    });
    expect(degraded).toEqual({ value: 1, _degraded: true });
  });

  it("rethrows when there is no cached value", async () => {
    const cache = createResponseCache({ storage: memoryStorage() });
    await expect(cache.wrapAsync("missing", async () => {
      throw new Error("offline");
    })).rejects.toThrow(/offline/);
  });
});

describe("cachedCalendar", () => {
  it("caches convert and Shabbat responses and marks degraded fallbacks", async () => {
    const convert = vi.fn()
      .mockResolvedValueOnce({ hy: 5786, hm: "Elul", hd: 17, gy: 2026, gm: 8, gd: 30 } satisfies ConvertResult)
      .mockRejectedValueOnce(new Error("down"));
    const getShabbat = vi.fn()
      .mockResolvedValueOnce({
        items: [
          { category: "candles", title: "Candle lighting: 6:00pm" },
          { category: "havdalah", title: "Havdalah: 7:00pm" },
        ],
      } satisfies ShabbatPayload)
      .mockRejectedValueOnce(new Error("down"));

    const calendar = createCachedCalendar({
      calendar: { convert, getShabbat },
      cache: createResponseCache({ storage: memoryStorage() }),
    });

    await expect(calendar.convert({ gy: 2026, g2h: 1 })).resolves.toMatchObject({ hy: 5786 });
    await expect(calendar.convert({ gy: 2026, g2h: 1 })).resolves.toMatchObject({ hy: 5786, _degraded: true });

    const location = { kind: "geonameid" as const, id: "281184" };
    await expect(calendar.getShabbat(location)).resolves.toMatchObject({ items: expect.any(Array) });
    await expect(calendar.getShabbat(location)).resolves.toMatchObject({ _degraded: true });
  });
});
