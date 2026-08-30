import { formatGregorian, isoDate, pad2 } from "./dates.js";

export async function nextObservance(record, hebrewYear, convertFn, today = isoDate()) {
  for (let year = hebrewYear; year <= hebrewYear + 2; year += 1) {
    try {
      const data = await convertFn({ hy: year, hm: record.hm, hd: record.hd, h2g: 1 });
      const iso = `${data.gy}-${pad2(data.gm)}-${pad2(data.gd)}`;
      if (iso >= today) return { iso, formatted: formatGregorian(data.gy, data.gm, data.gd) };
    } catch {
      // A month such as Adar II can be absent in a non-leap year; try the next year.
    }
  }
  return null;
}

export async function refreshUpcoming(records, hebrewYear, convertFn, today = isoDate()) {
  const pending = records.filter((record) => !record.nextIso || record.nextIso < today);
  const nextDates = await Promise.all(
    pending.map((record) => nextObservance(record, hebrewYear, convertFn, today)),
  );
  const updates = new Map();
  pending.forEach((record, index) => {
    const next = nextDates[index];
    if (next) updates.set(record.id, { nextIso: next.iso, nextFormatted: next.formatted });
  });
  return updates;
}
