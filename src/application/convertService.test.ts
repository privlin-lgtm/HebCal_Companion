import { describe, it, expect, vi } from "vitest";
import { createConvertService } from "./convertService";
import type { CalendarPort, ConvertParams, ConvertResult } from "./ports";

function makeFakeCalendar(): CalendarPort {
  const convert = vi.fn<(p: ConvertParams) => Promise<ConvertResult>>();
  convert.mockResolvedValue({
    gy: 2026, gm: 9, gd: 5, hy: 5786, hm: "Elul", hd: 23,
    hebrew: "כ״ג אֱלוּל תשפ״ו", events: [],
  });
  return { convert, getShabbat: vi.fn() };
}

describe("createConvertService", () => {
  it("todayHebrew converts the current date", async () => {
    const calendar = makeFakeCalendar();
    const service = createConvertService({ calendar });
    const result = await service.todayHebrew(new Date("2026-09-05T10:00:00"));
    expect(calendar.convert).toHaveBeenCalledWith(expect.objectContaining({ g2h: 1 }));
    expect(result.hm).toBe("Elul");
  });
  it("todayHebrew advances the date after sunset", async () => {
    const calendar = makeFakeCalendar();
    const service = createConvertService({ calendar });
    await service.todayHebrew(new Date("2026-09-05T19:00:00"), true);
    expect(calendar.convert).toHaveBeenCalledWith(expect.objectContaining({ gd: 6 }));
  });
  it("gregorianToHebrew passes afterSunset as gs=on", async () => {
    const calendar = makeFakeCalendar();
    const service = createConvertService({ calendar });
    await service.gregorianToHebrew({ gy: 2026, gm: 9, gd: 5, afterSunset: true });
    expect(calendar.convert).toHaveBeenCalledWith(expect.objectContaining({ gs: "on" }));
  });
  it("gregorianToHebrew omits gs when afterSunset is false", async () => {
    const calendar = makeFakeCalendar();
    const service = createConvertService({ calendar });
    await service.gregorianToHebrew({ gy: 2026, gm: 9, gd: 5, afterSunset: false });
    expect(calendar.convert).toHaveBeenCalledWith(expect.not.objectContaining({ gs: expect.anything() }));
  });
  it("hebrewToGregorian passes h2g=1", async () => {
    const calendar = makeFakeCalendar();
    const service = createConvertService({ calendar });
    await service.hebrewToGregorian({ hy: 5786, hm: "Elul", hd: 23 });
    expect(calendar.convert).toHaveBeenCalledWith(expect.objectContaining({ h2g: 1, hy: 5786 }));
  });
});
