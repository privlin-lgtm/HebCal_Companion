/**
 * Local calendar adapter using @hebcal/core — fully offline date conversion,
 * holidays, parashat, zmanim, and candle-lighting times.
 */
import { HDate, HebrewCalendar, Zmanim, Location as HebcalLocation, getHolidaysOnDate, greg } from "@hebcal/core";
import type { CalendarPort, ConvertParams, ConvertResult, Location, RequestOptions, ShabbatPayload, ShabbatItem } from "../application/ports";
import type { ZmanimView, ZmanEntry } from "../domain/zmanim";
import type { LearningView } from "../domain/learning";
import type { MonthData, CalendarDay } from "../domain/calendarView";
import type { WeeklyView, WeeklyEvent } from "../domain/weeklyView";
import { clockFromInstant } from "../domain/dates";
import { lookupGeonameid } from "./cityDatabase";

function toHebcalLocation(loc: Location): HebcalLocation {
  switch (loc.kind) {
    case "coordinates":
      return new HebcalLocation(loc.lat, loc.lng, false, loc.tzid);
    case "geonameid": {
      const city = lookupGeonameid(loc.id);
      if (!city) throw new Error("Local zmanim is not available for this city. Use city search to resolve coordinates.");
      return new HebcalLocation(city.lat, city.lng, city.isIsrael, city.tzid, city.name, city.countryCode);
    }
    case "zip":
      throw new Error("Local zmanim requires coordinates. Use city search to find your location.");
    case "city":
      throw new Error("Local zmanim requires coordinates. Use city search to find your location.");
    default:
      throw new Error("Local zmanim requires coordinates. Use city search to find your location.");
  }
}

function hdToConvertResult(hd: HDate): ConvertResult {
  const g = hd.greg();
  const holidays = getHolidaysOnDate(hd) || [];
  const events = holidays.map((h) => h.getDesc());
  return {
    gy: g.getFullYear(), gm: g.getMonth() + 1, gd: g.getDate(),
    hy: hd.getFullYear(), hm: hd.getMonthName(), hd: hd.getDate(),
    hebrew: hd.renderGematriya(), events,
  };
}

export function createHebcalLocalCalendar(): CalendarPort {
  async function convertLocal(params: ConvertParams): Promise<ConvertResult> {
    if (params.g2h) {
      const d = new Date(params.gy!, params.gm! - 1, params.gd!);
      const abs = greg.greg2abs(d);
      return hdToConvertResult(new HDate(abs));
    }
    if (params.h2g) {
      const hd = new HDate(Number(params.hd), params.hm!, Number(params.hy));
      return hdToConvertResult(hd);
    }
    throw new Error("Conversion direction not specified.");
  }

  async function convert(params: ConvertParams, _options?: RequestOptions): Promise<ConvertResult> {
    return convertLocal(params);
  }

  async function getHebrewDate(date: Date, afterSunset = false): Promise<ConvertResult> {
    let d = date;
    if (afterSunset) { d = new Date(date); d.setDate(d.getDate() + 1); }
    return hdToConvertResult(new HDate(greg.greg2abs(d)));
  }

  async function getShabbat(location: Location, _options?: RequestOptions): Promise<ShabbatPayload> {
    const loc = toHebcalLocation(location);
    const now = new Date();
    const friday = new Date(now);
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
    friday.setDate(friday.getDate() + daysUntilFriday);
    const saturday = new Date(friday);
    saturday.setDate(saturday.getDate() + 1);

    const fridayZmanim = new Zmanim(loc, friday, false);
    const saturdayZmanim = new Zmanim(loc, saturday, false);
    const candleTime = fridayZmanim.sunsetOffset(-18, true);
    const havdalahTime = saturdayZmanim.tzeit(8.5);

    const hd = new HDate(greg.greg2abs(saturday));
    const sedra = HebrewCalendar.getSedra(hd.getFullYear(), false);
    const abs = greg.greg2abs(saturday);
    const parshaLookup = sedra.lookup(abs);
    const parshaName = parshaLookup ? `Parashat ${parshaLookup.parsha.join(" ")}` : "Shabbat";

    const items: ShabbatItem[] = [];
    if (candleTime) items.push({ category: "candles", date: candleTime.toISOString(), title: "Candle lighting" });
    if (havdalahTime) items.push({ category: "havdalah", date: havdalahTime.toISOString(), title: "Havdalah" });
    items.push({ category: "parashat", title: parshaName });

    return {
      location: { title: loc.getName() || "Unknown", tzid: loc.getTzid() },
      range: { start: friday.toISOString().slice(0, 10), end: saturday.toISOString().slice(0, 10) },
      items,
    };
  }

  async function getZmanim(location: Location, date?: string, _options?: RequestOptions): Promise<ZmanimView> {
    const loc = toHebcalLocation(location);
    const d = date ? new Date(date) : new Date();
    const z = new Zmanim(loc, d, false);
    const tzid = loc.getTzid();
    const entries: ZmanEntry[] = [];
    const add = (key: ZmanEntry["key"], labelKey: string, time: Date | null) => {
      if (time) entries.push({ key, labelKey, time: clockFromInstant(time.toISOString(), tzid), iso: time.toISOString() });
    };
    add("alotHashachar", "zmanim.alotHashachar", z.alotHaShachar());
    add("misheyakir", "zmanim.misheyakir", z.misheyakir());
    add("sunrise", "zmanim.sunrise", z.sunrise());
    add("sofZmanShma", "zmanim.sofZmanShma", z.sofZmanShma());
    add("sofZmanTfilla", "zmanim.sofZmanTfilla", z.sofZmanTfilla());
    add("chatzot", "zmanim.chatzot", z.chatzot());
    add("minchaGedola", "zmanim.minchaGedola", z.minchaGedola());
    add("minchaKetana", "zmanim.minchaKetana", z.minchaKetana());
    add("plagHamincha", "zmanim.plagHamincha", z.plagHaMincha());
    add("sunset", "zmanim.sunset", z.sunset());
    add("tzeitHakochavim", "zmanim.tzeitHakochavim", z.tzeit(8.5));
    return { date: d.toISOString().slice(0, 10), locationName: loc.getName() || "Unknown", zmanim: entries };
  }

  async function getLearning(_date?: string, _options?: RequestOptions): Promise<LearningView> {
    return { date: _date || new Date().toISOString().slice(0, 10), entries: [] };
  }

  async function getMonthData(hebrewYear: number, hebrewMonth: number, _options?: RequestOptions): Promise<MonthData> {
    // hebrewMonth is 1-based from Tishrei (Tishrei=1)
    // @hebcal/core uses different month numbering — Nisan=1, ... Elul=13/14
    // We need to map our Tishrei-based month to @hebcal/core's Nisan-based month
    const monthNames = ["Tishrei", "Cheshvan", "Kislev", "Tevet", "Sh'vat", "Adar", "Adar I", "Adar II", "Nisan", "Iyyar", "Sivan", "Tamuz", "Av", "Elul"];
    const monthName = monthNames[hebrewMonth - 1] || "Tishrei";
    const isLeap = HDate.isLeapYear(hebrewYear);
    // For non-leap years, Adar I and Adar II don't exist — use Adar
    let actualMonth = monthName;
    if (!isLeap && (monthName === "Adar I" || monthName === "Adar II")) actualMonth = "Adar";

    const daysInMonth = HDate.daysInMonth(hebrewYear, HDate.monthFromName(actualMonth as never));
    const today = new Date();
    const todayAbs = greg.greg2abs(today);
    const sedra = HebrewCalendar.getSedra(hebrewYear, false);

    const days: CalendarDay[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const hd = new HDate(day, actualMonth as never, hebrewYear);
      const g = hd.greg();
      const abs = hd.abs();
      const dow = g.getDay();
      const isShabbat = dow === 6;
      const holidays = (getHolidaysOnDate(hd) || []).map((h) => h.getDesc());
      const parashat = isShabbat ? (() => {
        const lookup = sedra.lookup(abs);
        return lookup ? `Parashat ${lookup.parsha.join(" ")}` : undefined;
      })() : undefined;
      days.push({
        hebrewDay: day,
        hebrewMonth: actualMonth,
        hebrewYear,
        gregorian: { year: g.getFullYear(), month: g.getMonth() + 1, day: g.getDate() },
        dayOfWeek: dow,
        isShabbat,
        isToday: abs === todayAbs,
        holidays,
        parashat,
      });
    }

    // Build grid with leading nulls for alignment
    const firstDay = days[0];
    const grid: (CalendarDay | null)[] = [];
    if (firstDay) {
      for (let i = 0; i < firstDay.dayOfWeek; i++) grid.push(null);
    }
    days.forEach((d) => grid.push(d));

    const gregMonthName = firstDay ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(firstDay.gregorian.year, firstDay.gregorian.month - 1, firstDay.gregorian.day)) : "";

    return {
      hebrewMonth: actualMonth,
      hebrewYear,
      hebrewMonthName: actualMonth,
      gregorianMonthName: gregMonthName,
      days,
      grid,
    };
  }

  async function getWeeklyEvents(_options?: RequestOptions): Promise<WeeklyView> {
    const now = new Date();
    const events: WeeklyEvent[] = [];
    const weekStart = new Date(now);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let parashat = "";
    const sedra = HebrewCalendar.getSedra(new HDate(greg.greg2abs(now)).getFullYear(), false);

    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const abs = greg.greg2abs(d);
      const hd = new HDate(abs);
      const holidays = getHolidaysOnDate(hd) || [];

      for (const h of holidays) {
        const desc = h.getDesc();
        const flags = h.getFlags();
        let category: WeeklyEvent["category"] = "holiday";
        if (flags & 128) category = "roshChodesh";
        else if (flags & 256 || flags & 16384) category = "fast";
        else if (flags & 512) category = "specialShabbat";
        else if (flags & 4096) category = "omer";

        events.push({
          date: d.toISOString().slice(0, 10),
          hebrewDate: hd.renderGematriya(),
          title: desc,
          category,
        });
      }

      if (d.getDay() === 6 && !parashat) {
        const lookup = sedra.lookup(abs);
        if (lookup) parashat = `Parashat ${lookup.parsha.join(" ")}`;
      }
    }

    return {
      events: events.sort((a, b) => a.date.localeCompare(b.date)),
      parashat: parashat || "Shabbat",
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
    };
  }

  return { convert, convertLocal, getHebrewDate, getShabbat, getZmanim, getLearning, getMonthData, getWeeklyEvents };
}