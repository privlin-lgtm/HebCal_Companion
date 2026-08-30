import { collectUpcomingUpdates } from "../domain/calendar.js";
import {
  mergeImported,
  parseImport,
  serializeExport,
} from "../domain/remembrance.js";
import { isoDate } from "../domain/dates.js";

/**
 * Application service for remembrances.
 * Depends on CalendarPort + RemembranceRepository + IdGenerator + Clock (injected).
 */
export function createRemembranceService({
  calendar,
  remembrances,
  ids,
  clock = { now: () => new Date(), todayIso: () => isoDate() },
}) {
  function list() {
    return remembrances.list();
  }

  function remove(id) {
    return remembrances.saveAll(remembrances.list().filter((row) => row.id !== id));
  }

  async function createFromGregorian({ name, type, gy, gm, gd, afterSunset, originalDate }) {
    const converted = await calendar.convert({
      gy, gm, gd, g2h: 1,
      ...(afterSunset ? { gs: "on" } : {}),
    });
    const record = {
      id: ids.next(),
      name,
      type,
      hy: converted.hy,
      hm: converted.hm,
      hd: converted.hd,
      originalDate,
    };
    remembrances.saveAll([...remembrances.list(), record]);
    return record;
  }

  async function refreshUpcoming(hebrewYear) {
    const records = remembrances.list();
    if (!records.length) return records;

    let year = hebrewYear;
    if (!year) {
      const today = clock.now();
      const current = await calendar.convert({
        gy: today.getFullYear(),
        gm: today.getMonth() + 1,
        gd: today.getDate(),
        g2h: 1,
      });
      year = current.hy;
    }

    const updates = await collectUpcomingUpdates(
      records,
      year,
      (params) => calendar.convert(params),
      clock.todayIso(),
    );
    if (updates.size) return remembrances.mergeUpcoming(updates);
    return records;
  }

  function exportBackup() {
    return serializeExport(remembrances.list(), clock.now().toISOString());
  }

  function importBackup(payload) {
    const incoming = parseImport(payload);
    const merged = mergeImported(remembrances.list(), incoming);
    remembrances.saveAll(merged.records);
    return merged;
  }

  return {
    list,
    remove,
    createFromGregorian,
    refreshUpcoming,
    exportBackup,
    importBackup,
  };
}
