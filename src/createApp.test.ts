import { describe, expect, it, vi } from "vitest";
import { createApp } from "./createApp";

describe("createApp composition root", () => {
  it("accepts injected ports without touching the network or DOM", async () => {
    const calendar = {
      convert: vi.fn(async () => ({ hy: 5786, hm: "Elul", hd: 17, hebrew: "י״ז באלול", gy: 2026, gm: 8, gd: 30 })),
      getShabbat: vi.fn(),
    };
    const remembrances = {
      list: vi.fn(() => []),
      saveAll: vi.fn((rows: import("./application/ports").Remembrance[]) => rows),
      mergeUpcoming: vi.fn(),
    };
    const app = createApp({
      calendar,
      geocoder: { searchCity: vi.fn() },
      remembrances,
      locationStore: { read: () => null, write: vi.fn() },
      ids: { next: () => "id" },
      clock: { now: () => new Date(2026, 7, 30), todayIso: () => "2026-08-30" },
      showToast: vi.fn(),
      root: {} as Document,
    });

    await expect(app.services.convertService.todayHebrew(new Date(2026, 7, 30)))
      .resolves.toMatchObject({ hy: 5786 });
    expect(calendar.convert).toHaveBeenCalled();
  });

  it("wraps the Hebcal calendar with durable response cache by default", async () => {
    const storage = {
      store: {} as Record<string, string>,
      getItem(key: string) { return Object.hasOwn(this.store, key) ? this.store[key] : null; },
      setItem(key: string, value: string) { this.store[key] = value; },
    };
    const shared = {
      geocoder: { searchCity: vi.fn() },
      remembrances: {
        list: () => [] as import("./application/ports").Remembrance[],
        saveAll: (r: import("./application/ports").Remembrance[]) => r,
        mergeUpcoming: vi.fn(),
      },
      locationStore: { read: () => null, write: vi.fn() },
      ids: { next: () => "id" },
      clock: { now: () => new Date(2026, 7, 30), todayIso: () => "2026-08-30" },
      showToast: vi.fn(),
      root: {} as Document,
      storage,
    };

    const warm = createApp({
      ...shared,
      httpJson: vi.fn().mockResolvedValue({ hy: 5786, hm: "Elul", hd: 17, gy: 2026, gm: 8, gd: 30, hebrew: "ok" }),
    });
    await expect(warm.services.convertService.todayHebrew(new Date(2026, 7, 30)))
      .resolves.toMatchObject({ hy: 5786 });

    // Simulate a reload: new in-memory converter cache, same durable storage, network down.
    const cold = createApp({
      ...shared,
      httpJson: vi.fn().mockRejectedValue(new Error("Could not reach Hebcal. Check your connection and try again.")),
    });
    await expect(cold.ports.calendar.convert({ gy: 2026, gm: 8, gd: 30, g2h: 1 }))
      .resolves.toMatchObject({ hy: 5786, _degraded: true });
  });
});
