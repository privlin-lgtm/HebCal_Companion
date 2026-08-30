import type { CalendarPort, ConvertResult } from "./ports";

export type ConvertService = {
  todayHebrew(date?: Date): Promise<ConvertResult>;
  gregorianToHebrew(params: {
    gy: number;
    gm: number;
    gd: number;
    afterSunset?: boolean;
  }): Promise<ConvertResult>;
  hebrewToGregorian(params: {
    hy: number | string;
    hm: string;
    hd: number | string;
  }): Promise<ConvertResult>;
};

/**
 * Thin convert use-case facade over CalendarPort.
 */
export function createConvertService({ calendar }: { calendar: CalendarPort }): ConvertService {
  async function todayHebrew(date: Date = new Date()) {
    return calendar.convert({
      gy: date.getFullYear(),
      gm: date.getMonth() + 1,
      gd: date.getDate(),
      g2h: 1,
    });
  }

  async function gregorianToHebrew({
    gy,
    gm,
    gd,
    afterSunset = false,
  }: {
    gy: number;
    gm: number;
    gd: number;
    afterSunset?: boolean;
  }) {
    return calendar.convert({
      gy, gm, gd, g2h: 1,
      ...(afterSunset ? { gs: "on" } : {}),
    });
  }

  async function hebrewToGregorian({
    hy,
    hm,
    hd,
  }: {
    hy: number | string;
    hm: string;
    hd: number | string;
  }) {
    return calendar.convert({ hy, hm, hd, h2g: 1 });
  }

  return {
    todayHebrew,
    gregorianToHebrew,
    hebrewToGregorian,
  };
}
