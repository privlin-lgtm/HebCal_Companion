import { clockFromHebcalItem, formatApiDate, formatGregorian, isoDate, toIsoDay } from "./dates.js";

/**
 * Pure calendar policy: walk Hebrew years until a secular date is on/after today.
 * @param {object} record
 * @param {number} hebrewYear
 * @param {(params: object) => Promise<{gy:number,gm:number,gd:number}>} convert
 * @param {string} [today]
 */
export async function nextObservance(record, hebrewYear, convert, today = isoDate()) {
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

export async function collectUpcomingUpdates(records, hebrewYear, convert, today = isoDate()) {
  const pending = records.filter((record) => !record.nextIso || record.nextIso < today);
  const nextDates = await Promise.all(
    pending.map((record) => nextObservance(record, hebrewYear, convert, today)),
  );
  const updates = new Map();
  pending.forEach((record, index) => {
    const next = nextDates[index];
    if (next) updates.set(record.id, { nextIso: next.iso, nextFormatted: next.formatted });
  });
  return updates;
}

/** Map a Hebcal Shabbat payload into a view model. */
export function projectShabbat(data, fallbackName) {
  const candles = data.items?.find((item) => item.category === "candles");
  const havdalah = data.items?.find((item) => item.category === "havdalah");
  const parashat = data.items?.find((item) => item.category === "parashat");
  if (!candles || !havdalah) {
    throw new Error("Hebcal did not return complete Shabbat times for this location.");
  }
  const place = data.location?.title || fallbackName;
  const timeZone = data.location?.tzid;
  return {
    place,
    endsLabel: data.range?.end ? `Ends ${formatApiDate(data.range.end)}` : "",
    parashat: parashat?.title || candles.memo || "Shabbat",
    candleTime: clockFromHebcalItem(candles, timeZone),
    havdalahTime: clockFromHebcalItem(havdalah, timeZone),
    note: `Times are calculated for ${place}. Confirm local community practice when needed.`,
  };
}
