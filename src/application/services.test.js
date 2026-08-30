import { describe, expect, it, vi } from "vitest";
import { createConvertService } from "./convertService.js";
import { createRemembranceService } from "./remembranceService.js";
import { createShabbatService } from "./shabbatService.js";

describe("convertService", () => {
  it("delegates to the injected calendar port", async () => {
    const calendar = {
      convert: vi.fn(async (params) => ({ ...params, hebrew: "ok" })),
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
        location: { kind: "coordinates", lat: 1, lng: 2, tzid: "Europe/Paris" },
      })),
    };
    const calendar = {
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
});

describe("remembranceService", () => {
  const base = {
    id: "r1",
    name: "Rivka",
    type: "Yahrzeit",
    hy: 5780,
    hm: "Tevet",
    hd: 10,
    originalDate: "2020-01-07",
  };

  it("creates, refreshes, exports, and imports through injected ports", async () => {
    let rows = [];
    const remembrances = {
      list: () => rows,
      saveAll: (next) => { rows = next; return next; },
      mergeUpcoming: (updates) => {
        rows = rows.map((row) => updates.has(row.id) ? { ...row, ...updates.get(row.id) } : row);
        return rows;
      },
    };
    const calendar = {
      convert: vi.fn(async (params) => {
        if (params.g2h) return { hy: 5780, hm: "Tevet", hd: 10 };
        return { gy: 2026, gm: 12, gd: 20 };
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
    let rows = [base];
    const service = createRemembranceService({
      calendar: { convert: vi.fn() },
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
