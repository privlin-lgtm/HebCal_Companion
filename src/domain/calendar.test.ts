import { describe, expect, it, vi } from "vitest";
import { collectUpcomingUpdates, nextObservance, projectShabbat } from "./calendar";

describe("calendar domain", () => {
  it("skips past dates and absent months when resolving next observance", async () => {
    const convert = vi.fn(async ({ hy }: { hy?: number | string }) => (
      hy === 5786 ? { gy: 2026, gm: 1, gd: 1 } : { gy: 2026, gm: 12, gd: 20 }
    ));
    await expect(nextObservance({ hm: "Tevet", hd: 10 }, 5786, convert, "2026-08-30"))
      .resolves.toMatchObject({ iso: "2026-12-20" });

    const missing = vi.fn(async ({ hy }: { hy?: number | string }) => {
      if (hy === 5786) throw new Error("invalid");
      return { gy: 2027, gm: 3, gd: 8 };
    });
    await expect(nextObservance({ hm: "Adar II", hd: 14 }, 5786, missing, "2026-08-30"))
      .resolves.toMatchObject({ iso: "2027-03-08" });
  });

  it("collects upcoming updates in parallel and skips fresh nextIso values", async () => {
    const convert = vi.fn(async () => ({ gy: 2026, gm: 12, gd: 20 }));
    const updates = await collectUpcomingUpdates(
      [
        { id: "fresh", name: "A", type: "Yahrzeit", hy: 5780, hm: "Av", hd: 9, nextIso: "2026-08-31" },
        { id: "stale", name: "B", type: "Yahrzeit", hy: 5780, hm: "Tevet", hd: 10, nextIso: "2026-01-01" },
      ],
      5786,
      convert,
      "2026-08-30",
    );
    expect(updates.has("fresh")).toBe(false);
    expect(updates.get("stale")?.nextIso).toBe("2026-12-20");
    expect(convert).toHaveBeenCalledTimes(1);
  });

  it("projects a Shabbat payload into a view model", () => {
    const view = projectShabbat({
      location: { title: "Jerusalem, Israel", tzid: "Asia/Jerusalem" },
      range: { end: "2026-08-29" },
      items: [
        { category: "candles", date: "2026-08-28T18:28:00+03:00", title: "Candle lighting: 6:28pm" },
        { category: "havdalah", date: "2026-08-29T19:44:00+03:00", title: "Havdalah: 7:44pm" },
        { category: "parashat", title: "Parashat Ki Tavo" },
      ],
    }, "Fallback");
    expect(view.place).toBe("Jerusalem, Israel");
    expect(view.parashat).toBe("Parashat Ki Tavo");
    expect(view.endsLabel).toMatch(/Ends/);
    expect(view.candleTime).toMatch(/18:28|6:28/);
    expect(view.degraded).toBeUndefined();
  });

  it("marks degraded Shabbat payloads on the view", () => {
    const view = projectShabbat({
      _degraded: true,
      items: [
        { category: "candles", date: "2026-08-28T18:28:00+03:00", title: "Candle lighting: 6:28pm" },
        { category: "havdalah", date: "2026-08-29T19:44:00+03:00", title: "Havdalah: 7:44pm" },
      ],
    }, "Fallback");
    expect(view.degraded).toBe(true);
  });

  it("rejects incomplete Shabbat payloads", () => {
    expect(() => projectShabbat({ items: [] }, "x")).toThrow(/complete Shabbat times/);
  });
});
