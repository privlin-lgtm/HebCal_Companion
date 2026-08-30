/** Domain date helpers — no I/O. */

export function isoDate(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function pad2(value: number | string): string {
  return String(value).padStart(2, "0");
}

export function toIsoDay(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function formatGregorian(year: number, month: number, day: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date(year, month - 1, day));
}

export function formatApiDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function clockFromInstant(isoDateTime: string | null | undefined, timeZone?: string): string {
  if (!isoDateTime) return "";
  const options: Intl.DateTimeFormatOptions = { timeStyle: "short" };
  if (timeZone) options.timeZone = timeZone;
  return new Intl.DateTimeFormat(undefined, options).format(new Date(isoDateTime));
}

export function clockFromTitle(title = ""): string {
  const match = String(title).match(/:\s*(.+)$/);
  return match ? match[1] : title;
}

export type HebcalClockItem = {
  date?: string;
  title?: string;
} | null | undefined;

export function clockFromHebcalItem(item: HebcalClockItem, timeZone?: string): string {
  if (item?.date) return clockFromInstant(item.date, timeZone);
  return clockFromTitle(item?.title);
}
