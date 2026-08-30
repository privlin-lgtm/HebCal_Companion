/**
 * Thin convert use-case facade over CalendarPort.
 */
export function createConvertService({ calendar }) {
  async function todayHebrew(date = new Date()) {
    return calendar.convert({
      gy: date.getFullYear(),
      gm: date.getMonth() + 1,
      gd: date.getDate(),
      g2h: 1,
    });
  }

  async function gregorianToHebrew({ gy, gm, gd, afterSunset = false }) {
    return calendar.convert({
      gy, gm, gd, g2h: 1,
      ...(afterSunset ? { gs: "on" } : {}),
    });
  }

  async function hebrewToGregorian({ hy, hm, hd }) {
    return calendar.convert({ hy, hm, hd, h2g: 1 });
  }

  return {
    todayHebrew,
    gregorianToHebrew,
    hebrewToGregorian,
  };
}
