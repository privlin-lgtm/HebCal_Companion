import type { CalendarPort, ConvertResult } from "./ports";
import { effectiveGregorianDate } from "../domain/dates";

export type ConvertService = {
  todayHebrew(date?: Date, afterSunset?: boolean): Promise<ConvertResult>;
  gregorianToHebrew(params: { gy: number; gm: number; gd: number; afterSunset?: boolean }): Promise<ConvertResult>;
  hebrewToGregorian(params: { hy: number | string; hm: string; hd: number | string }): Promise<ConvertResult>;
};

export function createConvertService({ calendar }: { calendar: CalendarPort }): ConvertService {
  async function todayHebrew(date: Date = new Date(), afterSunset = false): Promise<ConvertResult> {
    const effective = effectiveGregorianDate(date, afterSunset);
    return calendar.convert({ gy: effective.getFullYear(), gm: effective.getMonth() + 1, gd: effective.getDate(), g2h: 1 });
  }
  async function gregorianToHebrew({ gy, gm, gd, afterSunset = false }: { gy: number; gm: number; gd: number; afterSunset?: boolean }): Promise<ConvertResult> {
    return calendar.convert({ gy, gm, gd, g2h: 1, ...(afterSunset ? { gs: "on" } : {}) });
  }
  async function hebrewToGregorian({ hy, hm, hd }: { hy: number | string; hm: string; hd: number | string }): Promise<ConvertResult> {
    return calendar.convert({ hy, hm, hd, h2g: 1 });
  }
  return { todayHebrew, gregorianToHebrew, hebrewToGregorian };
}