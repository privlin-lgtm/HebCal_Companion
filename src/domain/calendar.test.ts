import { describe, it, expect, vi } from "vitest";
import { nextObservance, collectUpcomingUpdates, projectShabbat, type ConvertParams, type ConvertResult, type ShabbatPayload } from "./calendar";

const fakeConvert = vi.fn<(p: ConvertParams) => Promise<Pick<ConvertResult, "gy" | "gm" | "gd">>>();

function mockConvert(gy: number, gm: number, gd: number) {
  fakeConvert.mockResolvedValueOnce({ gy, gm, gd });
}

describe("nextObservance", () => {
  it("finds the next observance on or after today", async () => {
    mockConvert(2026, 9, 23);
    const result = await nextObservance({ hm: "Tishrei", hd: 1 }, 5787, fakeConvert, "2026-01-01");
    expect(result).toEqual({ iso: "2026-09-23", formatted: expect.any(String) });
  });
  it("skips past dates and finds the next year", async () => {
    mockConvert(2025, 9, 23); // past
    mockConvert(2026, 9, 23); // future
    const result = await nextObservance({ hm: "Tishrei", hd: 1 }, 5786, fakeConvert, "2026-01-01");
    expect(result?.iso).toBe("2026-09-23");
  });
  it("returns null when no observance found within 3 years", async () => {
    fakeConvert.mockRejectedValue(new Error("not found"));
    const result = await nextObservance({ hm: "Adar II", hd: 1 }, 5786, fakeConvert, "2026-01-01");
    expect(result).toBeNull();
  });
});

describe("collectUpcomingUpdates", () => {
  it("collects updates for records with stale or missing nextIso", async () => {
    const records = [
      { id: "a", hm: "Tishrei", hd: 1, nextIso: "2020-01-01" }, // stale
      { id: "b", hm: "Nisan", hd: 15, nextIso: null }, // missing
      { id: "c", hm: "Elul", hd: 1, nextIso: "2099-01-01" }, // future — skip
    ] as const;
    mockConvert(2026, 9, 23);
    mockConvert(2026, 4, 1);
    const updates = await collectUpcomingUpdates(records as never, 5787, fakeConvert, "2026-01-01");
    expect(updates.size).toBe(2);
    expect(updates.has("a")).toBe(true);
    expect(updates.has("b")).toBe(true);
    expect(updates.has("c")).toBe(false);
  });
});

describe("projectShabbat", () => {
  it("maps a Hebcal payload to a ShabbatView", () => {
    const payload: ShabbatPayload = {
      location: { title: "Jerusalem, Israel", tzid: "Asia/Jerusalem" },
      range: { start: "2026-09-04", end: "2026-09-05" },
      items: [
        { category: "candles", date: "2026-09-04T18:00:00", title: "Candle lighting: 6:00pm" },
        { category: "havdalah", date: "2026-09-05T19:00:00", title: "Havdalah: 7:00pm" },
        { category: "parashat", title: "Parashat Nitzavim" },
      ],
    };
    const view = projectShabbat(payload, "Fallback");
    expect(view.place).toBe("Jerusalem, Israel");
    expect(view.parashat).toBe("Parashat Nitzavim");
    expect(view.candleTime).toBeTruthy();
    expect(view.havdalahTime).toBeTruthy();
    expect(view.endsLabel).toContain("Ends");
  });
  it("throws when candles or havdalah are missing", () => {
    const payload: ShabbatPayload = { items: [{ category: "parashat", title: "Test" }] };
    expect(() => projectShabbat(payload, "Fallback")).toThrow();
  });
  it("marks degraded payloads", () => {
    const payload: ShabbatPayload = {
      _degraded: true,
      items: [
        { category: "candles", date: "2026-09-04T18:00:00" },
        { category: "havdalah", date: "2026-09-05T19:00:00" },
      ],
    };
    const view = projectShabbat(payload, "Fallback");
    expect(view.degraded).toBe(true);
  });
});
