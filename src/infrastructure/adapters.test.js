import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./httpClient.js";
import { buildHebcalUrl, converterCacheKey, createHebcalCalendar } from "./hebcalCalendar.js";
import { createOpenMeteoGeocoder } from "./openMeteoGeocoder.js";
import { createRemembranceRepository, REMEMBRANCE_STORAGE_KEY } from "./remembranceRepository.js";
import { createLocationStore, LOCATION_STORAGE_KEY } from "./locationStore.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.hasOwn(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
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
    expect(converterCacheKey({ b: 1, a: 2 })).toBe(converterCacheKey({ a: 2, b: 1 }));

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
  const valid = {
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
    store.write(null, "x");
    expect(JSON.parse(storage.getItem(LOCATION_STORAGE_KEY)).name).toBe("Jerusalem, Israel");
  });
});
