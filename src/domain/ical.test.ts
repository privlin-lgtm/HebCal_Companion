import { describe, it, expect } from "vitest";
import { generateICal } from "./ical";
import type { Remembrance } from "./remembrance";

const records: Remembrance[] = [
  {
    id: "abc123",
    name: "Rivka bat Avraham",
    type: "Yahrzeit",
    hy: 5786,
    hm: "Tishrei",
    hd: 1,
    originalDate: "2025-09-23",
    nextIso: "2026-09-23",
    nextFormatted: "Wednesday, September 23, 2026",
  },
];

describe("generateICal", () => {
  it("produces valid iCal structure", () => {
    const ics = generateICal(records);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Or Zarua");
  });
  it("includes a VEVENT for each record with a nextIso", () => {
    const ics = generateICal(records);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("UID:abc123@or-zarua");
    expect(ics).toContain("SUMMARY:Yahrzeit: Rivka bat Avraham");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260923");
  });
  it("includes a VALARM with 1-day trigger", () => {
    const ics = generateICal(records);
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("END:VALARM");
  });
  it("skips records without nextIso", () => {
    const ics = generateICal([{ ...records[0], nextIso: null }]);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
  it("escapes special characters", () => {
    const ics = generateICal([{ ...records[0], name: "Test; name, with\\special" }]);
    expect(ics).toContain("Test\\; name\\, with\\\\special");
  });
});
