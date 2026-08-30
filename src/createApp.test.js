import { describe, expect, it, vi } from "vitest";
import { createApp } from "./createApp.js";

describe("createApp composition root", () => {
  it("accepts injected ports without touching the network or DOM", async () => {
    const calendar = {
      convert: vi.fn(async () => ({ hy: 5786, hm: "Elul", hd: 17, hebrew: "י״ז באלול", gy: 2026, gm: 8, gd: 30 })),
      getShabbat: vi.fn(),
    };
    const remembrances = {
      list: vi.fn(() => []),
      saveAll: vi.fn((rows) => rows),
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
      root: {},
    });

    await expect(app.services.convertService.todayHebrew(new Date(2026, 7, 30)))
      .resolves.toMatchObject({ hy: 5786 });
    expect(calendar.convert).toHaveBeenCalled();
  });
});
