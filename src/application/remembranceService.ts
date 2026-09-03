import type { CalendarPort, Clock, IdGenerator, Remembrance, RemembranceRepository, RemembranceType } from "./ports";
import { collectUpcomingUpdates } from "../domain/calendar";
import { mergeImported, parseImport, serializeExport, type RemembranceExport } from "../domain/remembrance";
import { isoDate } from "../domain/dates";

export type RemembranceService = {
  list(): Remembrance[];
  remove(id: string): Remembrance[];
  createFromGregorian(params: { name: string; type: RemembranceType; gy: number; gm: number; gd: number; afterSunset?: boolean; originalDate?: string; notifyEnabled?: boolean }): Promise<Remembrance>;
  updateNotification(id: string, enabled: boolean, daysBefore?: number): Remembrance[];
  refreshUpcoming(hebrewYear?: number): Promise<Remembrance[]>;
  exportBackup(): RemembranceExport;
  importBackup(payload: unknown): ReturnType<typeof mergeImported>;
  mergeRecords(incoming: Remembrance[]): ReturnType<typeof mergeImported>;
};

export function createRemembranceService({ calendar, remembrances, ids, clock = { now: () => new Date(), todayIso: () => isoDate() } }: {
  calendar: CalendarPort; remembrances: RemembranceRepository; ids: IdGenerator; clock?: Clock;
}): RemembranceService {
  function list() { return remembrances.list(); }
  function remove(id: string) { return remembrances.saveAll(remembrances.list().filter((row) => row.id !== id)); }
  async function createFromGregorian({ name, type, gy, gm, gd, afterSunset, originalDate, notifyEnabled = false }: { name: string; type: RemembranceType; gy: number; gm: number; gd: number; afterSunset?: boolean; originalDate?: string; notifyEnabled?: boolean }) {
    const converted = await calendar.convert({ gy, gm, gd, g2h: 1, ...(afterSunset ? { gs: "on" } : {}) });
    const record: Remembrance = { id: ids.next(), name, type, hy: converted.hy, hm: converted.hm, hd: converted.hd, originalDate, notifyEnabled };
    remembrances.saveAll([...remembrances.list(), record]);
    return record;
  }
  function updateNotification(id: string, enabled: boolean, daysBefore = 1) {
    const records = remembrances.list().map((r) => r.id === id ? { ...r, notifyEnabled: enabled, notifyDaysBefore: daysBefore } : r);
    return remembrances.saveAll(records);
  }
  async function refreshUpcoming(hebrewYear?: number) {
    const records = remembrances.list();
    if (!records.length) return records;
    let year = hebrewYear;
    if (!year) {
      const today = clock.now();
      const current = await calendar.convert({ gy: today.getFullYear(), gm: today.getMonth() + 1, gd: today.getDate(), g2h: 1 });
      year = current.hy;
    }
    const updates = await collectUpcomingUpdates(records, year, (params) => calendar.convert(params), clock.todayIso());
    if (updates.size) return remembrances.mergeUpcoming(updates);
    return records;
  }
  function exportBackup() { return serializeExport(remembrances.list(), clock.now().toISOString()); }
  function importBackup(payload: unknown) {
    const incoming = parseImport(payload);
    const merged = mergeImported(remembrances.list(), incoming);
    remembrances.saveAll(merged.records);
    return merged;
  }
  function mergeRecords(incoming: Remembrance[]) {
    const merged = mergeImported(remembrances.list(), incoming);
    remembrances.saveAll(merged.records);
    return merged;
  }
  return { list, remove, createFromGregorian, updateNotification, refreshUpcoming, exportBackup, importBackup, mergeRecords };
}