import { describe, it, expect } from "vitest";
import { generateICal } from "./ical";
import type { Remembrance } from "./remembrance";

const baseRecord: Remembrance = {
  id: "test1",
  name: "Test Person",
  type: "Yahrzeit",
  hy: 5786,
  hm: "Tishrei",
  hd: 1,
  originalDate: "2025-09-23",
  nextIso: "2026-09-23",
  nextFormatted: "Wednesday, September 23, 2026",
};

describe("iCal fixes", () => {
  it("uses single backslash-n for description line breaks (not double-escaped)", () => {
    const ics = generateICal([baseRecord]);
    // The description should contain \n (single backslash + n) for line breaks
    expect(ics).toContain("\\n");
    // Should NOT contain \\n (double backslash + n) which would be a literal backslash-n
    const descLine = ics.split("\r\n").find(l => l.startsWith("DESCRIPTION:"));
    expect(descLine).toBeDefined();
    // Verify it has single-backslash-n, not double
    expect(descLine).toContain("\\n");
    expect(descLine).not.toContain("\\\\n");
  });

  it("sets DTEND to the day after DTSTART (exclusive per RFC 5545)", () => {
    const ics = generateICal([baseRecord]);
    const dtstart = ics.split("\r\n").find(l => l.startsWith("DTSTART"));
    const dtend = ics.split("\r\n").find(l => l.startsWith("DTEND"));
    expect(dtstart).toContain("20260923");
    expect(dtend).toContain("20260924"); // next day
  });

  it("handles month boundary for DTEND (end of month)", () => {
    const record = { ...baseRecord, nextIso: "2026-01-31" };
    const ics = generateICal([record]);
    const dtend = ics.split("\r\n").find(l => l.startsWith("DTEND"));
    expect(dtend).toContain("20260201"); // Feb 1
  });

  it("handles year boundary for DTEND (Dec 31 → Jan 1)", () => {
    const record = { ...baseRecord, nextIso: "2026-12-31" };
    const ics = generateICal([record]);
    const dtend = ics.split("\r\n").find(l => l.startsWith("DTEND"));
    expect(dtend).toContain("20270101"); // Jan 1 next year
  });
});
