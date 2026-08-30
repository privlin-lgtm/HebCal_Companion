import { describe, expect, it, vi } from "vitest";
import { createConvertService } from "./convertService";
import { createRemembranceService } from "./remembranceService";
import { createShabbatService } from "./shabbatService";
import type { Remembrance } from "./ports";

describe("convertService", () => {
  it("delegates to the injected calendar port", async () => {
    const calendar = {
      convert: vi.fn(async (params: object) => ({ ...params, hebrew: "ok", gy: 1, gm: 1, gd: 1, hy: 1, hm: "Nisan", hd: 1 })),
      getShabbat: vi.fn(),
    };
    const service = createConvertService({ calendar });
    await service.gregorianToHebrew({ gy: 2026, gm: 8, gd: 30, afterSunset: true });
    expect(calendar.convert).toHaveBeenCalledWith({ gy: 2026, gm: 8, gd: 30, g2h: 1, gs: "on" });
  });
});

describe("shabbatService", () => {
  it("loads, projects, and persists location through injected ports", async () => {
    const locationStore = { read: vi.fn(() => null), write: vi.fn() };
    const calendar = {
      convert: vi.fn(),
      getShabbat: vi.fn(async () => ({
        location: { title: "New York City, New York, USA", tzid: "America/New_York" },
        range: { end: "2026-08-29" },
        items: [
          { category: "candles", date: "2026-08-28T19:05:00-04:00", title: "Candle lighting: 7:05pm" },
          { category: "havdalah", date: "2026-08-29T20:03:00-04:00", title: "Havdalah: 8:03pm" },
          { category: "parashat", title: "Parashat Nitzavim" },
        ],
      })),
    };
    const service = createShabbatService({
      calendar,
      geocoder: { searchCity: vi.fn() },
      locationStore,
    });
    const view = await service.load({ kind: "geonameid", id: "5128581" }, "NY");
    expect(view.parashat).toBe("Parashat Nitzavim");
    expect(locationStore.write).toHaveBeenCalledWith(
      { kind: "geonameid", id: "5128581" },
      "New York City, New York, USA",
    );
  });

  it("searches via the geocoder port then loads Shabbat", async () => {
    const geocoder = {
      searchCity: vi.fn(async () => ({
        name: "Paris, France",
        location: { kind: "coordinates" as const, lat: 1, lng: 2, tzid: "Europe/Paris" },
      })),
    };
    const calendar = {
      convert: vi.fn(),
      getShabbat: vi.fn(async () => ({
        location: { title: "Paris, France", tzid: "Europe/Paris" },
        items: [
          { category: "candles", date: "2026-08-28T20:00:00+02:00", title: "Candle lighting: 8:00pm" },
          { category: "havdalah", date: "2026-08-29T21:00:00+02:00", title: "Havdalah: 9:00pm" },
        ],
      })),
    };
    const locationStore = { read: () => null, write: vi.fn() };
    const service = createShabbatService({ calendar, geocoder, locationStore });
    const view = await service.searchAndLoad("Paris", "France");
    expect(geocoder.searchCity).toHaveBeenCalledWith("Paris", "France", { signal: undefined });
    expect(view.location.kind).toBe("coordinates");
  });

  it("surfaces degraded flag from cached calendar responses", async () => {
    const calendar = {
      convert: vi.fn(),
      getShabbat: vi.fn(async () => ({
        _degraded: true,
        location: { title: "Jerusalem, Israel", tzid: "Asia/Jerusalem" },
        items: [
          { category: "candles", date: "2026-08-28T18:28:00+03:00", title: "Candle lighting: 6:28pm" },
          { category: "havdalah", date: "2026-08-29T19:44:00+03:00", title: "Havdalah: 7:44pm" },
        ],
      })),
    };
    const service = createShabbatService({
      calendar,
      geocoder: { searchCity: vi.fn() },
      locationStore: { read: () => null, write: vi.fn() },
    });
    const view = await service.load({ kind: "geonameid", id: "281184" }, "Jerusalem");
    expect(view.degraded).toBe(true);
  });
});

describe("remembranceService", () => {
  const base: Remembrance = {
    id: "r1",
    name: "Rivka",
    type: "Yahrzeit",
    hy: 5780,
    hm: "Tevet",
    hd: 10,
    originalDate: "2020-01-07",
  };

  it("creates, refreshes, exports, and imports through injected ports", async () => {
    let rows: Remembrance[] = [];
    const remembrances = {
      list: () => rows,
      saveAll: (next: Remembrance[]) => { rows = next; return next; },
      mergeUpcoming: (updates: Map<string, Partial<Remembrance>>) => {
        rows = rows.map((row) => (updates.has(row.id) ? { ...row, ...updates.get(row.id) } : row));
        return rows;
      },
    };
    const calendar = {
      getShabbat: vi.fn(),
      convert: vi.fn(async (params: { g2h?: number | string }) => {
        if (params.g2h) return { hy: 5780, hm: "Tevet", hd: 10, gy: 2020, gm: 1, gd: 7 };
        return { gy: 2026, gm: 12, gd: 20, hy: 5786, hm: "Tevet", hd: 10 };
      }),
    };
    const service = createRemembranceService({
      calendar,
      remembrances,
      ids: { next: () => "generated-id" },
      clock: {
        now: () => new Date(2026, 7, 30),
        todayIso: () => "2026-08-30",
      },
    });

    await service.createFromGregorian({
      name: "Rivka",
      type: "Yahrzeit",
      gy: 2020, gm: 1, gd: 7,
      originalDate: "2020-01-07",
    });
    expect(rows[0].id).toBe("generated-id");

    await service.refreshUpcoming(5786);
    expect(rows[0].nextIso).toBe("2026-12-20");

    const exported = service.exportBackup();
    expect(exported.remembrances).toHaveLength(1);

    rows = [base];
    const merged = service.importBackup({ remembrances: [{ ...base, id: "r2", name: "Leah" }] });
    expect(merged.added).toBe(1);
    expect(rows).toHaveLength(2);
  });

  it("keeps local records when import ids conflict", () => {
    let rows: Remembrance[] = [base];
    const service = createRemembranceService({
      calendar: { convert: vi.fn(), getShabbat: vi.fn() },
      remembrances: {
        list: () => rows,
        saveAll: (next) => { rows = next; return next; },
        mergeUpcoming: vi.fn(),
      },
      ids: { next: () => "x" },
      clock: { now: () => new Date(), todayIso: () => "2026-08-30" },
    });
    const merged = service.importBackup({ remembrances: [{ ...base, name: "Imported" }] });
    expect(merged.skipped).toBe(1);
    expect(rows[0].name).toBe("Rivka");
  });
});
