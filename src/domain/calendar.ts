/** Pure calendar policy — no I/O. */

import type { Remembrance } from "./remembrance";
import { clockFromHebcalItem, formatApiDate, formatGregorian, toIsoDay } from "./dates";

export type ConvertParams = {
  gy?: number;
  gm?: number;
  gd?: number;
  hy?: number | string;
  hm?: string;
  hd?: number | string;
  g2h?: number | string;
  h2g?: number | string;
  gs?: string | number;
};

export type ConvertResult = {
  gy: number;
  gm: number;
  gd: number;
  hy: number;
  hm: string;
  hd: number;
  hebrew?: string;
  events?: string[];
};

export type ShabbatItem = {
  category: string;
  title?: string;
  date?: string;
  memo?: string;
};

export type ShabbatPayload = {
  location?: { title?: string; tzid?: string };
  range?: { start?: string; end?: string };
  items?: ShabbatItem[];
  _degraded?: boolean;
};

export type ShabbatView = {
  place: string;
  endsLabel: string;
  parashat: string;
  candleTime: string;
  havdalahTime: string;
  note: string;
  degraded?: boolean;
};

export type ObservanceResult = { iso: string; formatted: string };

/**
 * Walk Hebrew years until a secular date is on/after today.
 */
export async function nextObservance(
  record: Pick<Remembrance, "hm" | "hd">,
  hebrewYear: number,
  convert: (params: ConvertParams) => Promise<Pick<ConvertResult, "gy" | "gm" | "gd">>,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<ObservanceResult | null> {
  for (let year = hebrewYear; year <= hebrewYear + 2; year += 1) {
    try {
      const data = await convert({ hy: year, hm: record.hm, hd: record.hd, h2g: 1 });
      const iso = toIsoDay(data.gy, data.gm, data.gd);
      if (iso >= today) return { iso, formatted: formatGregorian(data.gy, data.gm, data.gd) };
    } catch {
      // A month such as Adar II can be absent in a non-leap year; try the next year.
    }
  }
  return null;
}

export async function collectUpcomingUpdates(
  records: Remembrance[],
  hebrewYear: number,
  convert: (params: ConvertParams) => Promise<Pick<ConvertResult, "gy" | "gm" | "gd">>,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<Map<string, { nextIso: string; nextFormatted: string }>> {
  const pending = records.filter((record) => !record.nextIso || record.nextIso < today);
  const nextDates = await Promise.all(
    pending.map((record) => nextObservance(record, hebrewYear, convert, today)),
  );
  const updates = new Map<string, { nextIso: string; nextFormatted: string }>();
  pending.forEach((record, index) => {
    const next = nextDates[index];
    if (next) updates.set(record.id, { nextIso: next.iso, nextFormatted: next.formatted });
  });
  return updates;
}

/** Map a Hebcal Shabbat payload into a view model. */
export function projectShabbat(data: ShabbatPayload, fallbackName: string): ShabbatView {
  const candles = data.items?.find((item) => item.category === "candles");
  const havdalah = data.items?.find((item) => item.category === "havdalah");
  const parashat = data.items?.find((item) => item.category === "parashat");
  if (!candles || !havdalah) {
    throw new Error("Hebcal did not return complete Shabbat times for this location.");
  }
  const place = data.location?.title || fallbackName;
  const timeZone = data.location?.tzid;
  const view: ShabbatView = {
    place,
    endsLabel: data.range?.end ? `Ends ${formatApiDate(data.range.end)}` : "",
    parashat: parashat?.title || candles.memo || "Shabbat",
    candleTime: clockFromHebcalItem(candles, timeZone),
    havdalahTime: clockFromHebcalItem(havdalah, timeZone),
    note: `Times are calculated for ${place}. Confirm local community practice when needed.`,
  };
  if (data._degraded) view.degraded = true;
  return view;
}