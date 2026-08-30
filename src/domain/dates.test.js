import { describe, expect, it } from "vitest";
import { clockFromHebcalItem, formatApiDate, formatGregorian, isoDate, pad2, toIsoDay } from "./dates.js";

describe("dates domain", () => {
  it("formats local ISO days and pads components", () => {
    expect(isoDate(new Date(2026, 7, 30, 15, 0, 0))).toBe("2026-08-30");
    expect(toIsoDay(2026, 1, 2)).toBe("2026-01-02");
    expect(pad2(0)).toBe("00");
  });

  it("formats display dates and Hebcal clocks", () => {
    expect(formatGregorian(2026, 1, 1)).toMatch(/January|1/);
    expect(formatApiDate("2026-12-31")).toMatch(/Dec|31|2026/);
    expect(clockFromHebcalItem({ date: "2026-09-04T18:41:00+03:00" }, "Asia/Jerusalem")).toMatch(/6:41|18:41/);
    expect(clockFromHebcalItem({ title: "Havdalah: 7:48pm" })).toBe("7:48pm");
    expect(clockFromHebcalItem(undefined)).toBe("");
  });
});
