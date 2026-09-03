import { describe, it, expect } from "vitest";
import { isoDate, pad2, toIsoDay, isAfterSunset, effectiveGregorianDate, parseIsoDate } from "./dates";

describe("pad2", () => {
  it("pads single digits", () => {
    expect(pad2(1)).toBe("01");
    expect(pad2(9)).toBe("09");
  });
  it("does not pad double digits", () => {
    expect(pad2(10)).toBe("10");
    expect(pad2(99)).toBe("99");
  });
});

describe("toIsoDay", () => {
  it("formats a date correctly", () => {
    expect(toIsoDay(2026, 9, 5)).toBe("2026-09-05");
    expect(toIsoDay(2026, 12, 1)).toBe("2026-12-01");
  });
});

describe("isoDate", () => {
  it("returns a YYYY-MM-DD string", () => {
    const result = isoDate(new Date("2026-09-05T12:00:00Z"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("isAfterSunset", () => {
  it("returns true after 18:00 by default", () => {
    expect(isAfterSunset(new Date("2026-09-05T19:00:00"))).toBe(true);
    expect(isAfterSunset(new Date("2026-09-05T17:00:00"))).toBe(false);
  });
  it("uses actual sunset when provided", () => {
    const sunset = new Date("2026-09-05T18:30:00");
    expect(isAfterSunset(new Date("2026-09-05T18:31:00"), sunset)).toBe(true);
    expect(isAfterSunset(new Date("2026-09-05T18:29:00"), sunset)).toBe(false);
  });
});

describe("effectiveGregorianDate", () => {
  it("advances by one day when afterSunset is true", () => {
    const now = new Date("2026-09-05T19:00:00");
    const effective = effectiveGregorianDate(now, true);
    expect(effective.getDate()).toBe(6);
  });
  it("returns the same date when afterSunset is false", () => {
    const now = new Date("2026-09-05T10:00:00");
    const effective = effectiveGregorianDate(now, false);
    expect(effective.getDate()).toBe(5);
  });
});

describe("parseIsoDate", () => {
  it("parses an ISO date string", () => {
    expect(parseIsoDate("2026-09-05")).toEqual({ gy: 2026, gm: 9, gd: 5 });
  });
});
