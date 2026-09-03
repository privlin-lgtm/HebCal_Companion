/**
 * Local calendar adapter using @hebcal/core — fully offline date conversion,
 * holidays, parashat, zmanim, and candle-lighting times.
 */
import { HDate, HebrewCalendar, Zmanim, Location as HebcalLocation, getHolidaysOnDate, greg } from "@hebcal/core";
import type { CalendarPort, ConvertParams, ConvertResult, Location, RequestOptions, ShabbatPayload, ShabbatItem } from "../application/ports";
import type { ZmanimView, ZmanEntry } from "../domain/zmanim";
import type { LearningView } from "../domain/learning";
import { clockFromInstant } from "../domain/dates";

function toHebcalLocation(loc: Location): HebcalLocation {
  switch (loc.kind) {
    case "coordinates":
      return new HebcalLocation(loc.lat, loc.lng, false, loc.tzid);
    case "geonameid":
      return new HebcalLocation(31.78, 35.22, true, "Asia/Jerusalem", "Jerusalem", "IL");
    case "zip":
      return new HebcalLocation(40.72, -74.0, false, "America/New_York", "New York", "US");
    case "city":
      return new HebcalLocation(31.78, 35.22, true, "Asia/Jerusalem", "Jerusalem", "IL");
    default:
      return new HebcalLocation(31.78, 35.22, true, "Asia/Jerusalem", "Jerusalem", "IL");
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

  return { convert, convertLocal, getHebrewDate, getShabbat, getZmanim, getLearning };
}