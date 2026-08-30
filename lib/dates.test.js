import { describe, expect, it } from "vitest";
import { clockFromHebcalItem, isoDate, pad2 } from "./dates.js";

describe("isoDate", () => {
  it("returns a local calendar date as YYYY-MM-DD", () => {
    expect(isoDate(new Date(2026, 7, 30, 15, 0, 0))).toBe("2026-08-30");
  });
});

describe("pad2", () => {
  it("pads single-digit months and days", () => {
    expect(pad2(3)).toBe("03");
    expect(pad2(12)).toBe("12");
  });
});

describe("clockFromHebcalItem", () => {
  it("formats item.date in the location timezone", () => {
    const clock = clockFromHebcalItem(
      { date: "2026-09-04T18:41:00+03:00", title: "Candle lighting: 6:41pm" },
      "Asia/Jerusalem",
    );
    expect(clock).toMatch(/6:41|18:41/);
  });

  it("falls back to the title clock when date is missing", () => {
    expect(clockFromHebcalItem({ title: "Havdalah: 7:48pm" })).toBe("7:48pm");
  });
});
