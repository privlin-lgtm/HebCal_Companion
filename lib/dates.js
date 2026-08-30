export function isoDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatGregorian(year, month, day) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date(year, month - 1, day));
}

export function formatApiDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function clockFromHebcalItem(item, timeZone) {
  if (item?.date) {
    const options = { timeStyle: "short" };
    if (timeZone) options.timeZone = timeZone;
    return new Intl.DateTimeFormat(undefined, options).format(new Date(item.date));
  }
  const title = item?.title || "";
  const match = title.match(/:\s*(.+)$/);
  return match ? match[1] : title;
}
