/** Domain date helpers — no I/O. */

export function isoDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function toIsoDay(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function formatGregorian(year, month, day) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date(year, month - 1, day));
}

export function formatApiDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function clockFromInstant(isoDateTime, timeZone) {
  if (!isoDateTime) return "";
  const options = { timeStyle: "short" };
  if (timeZone) options.timeZone = timeZone;
  return new Intl.DateTimeFormat(undefined, options).format(new Date(isoDateTime));
}

export function clockFromTitle(title = "") {
  const match = String(title).match(/:\s*(.+)$/);
  return match ? match[1] : title;
}

export function clockFromHebcalItem(item, timeZone) {
  if (item?.date) return clockFromInstant(item.date, timeZone);
  return clockFromTitle(item?.title);
}
