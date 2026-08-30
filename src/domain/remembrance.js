/** Remembrance entity rules — no I/O. */

export const HEBREW_MONTHS = Object.freeze([
  "Tishrei", "Cheshvan", "Kislev", "Tevet", "Sh'vat",
  "Adar", "Adar I", "Adar II",
  "Nisan", "Iyyar", "Sivan", "Tamuz", "Av", "Elul",
]);

export const MAX_REMEMBRANCES = 200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value) {
  return typeof value === "string" && ISO_DATE.test(value);
}

export function coerceRemembrance(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name.trim() : row.name,
    type: row.type,
    hy: Number(row.hy),
    hm: row.hm,
    hd: Number(row.hd),
    originalDate: row.originalDate,
    nextIso: row.nextIso,
    nextFormatted: row.nextFormatted,
  };
}

export function isRemembrance(row) {
  return Boolean(
    row
    && typeof row.id === "string"
    && row.id.length > 0
    && row.id.length < 80
    && typeof row.name === "string"
    && row.name.length > 0
    && row.name.length <= 80
    && (row.type === "Yahrzeit" || row.type === "Anniversary")
    && Number.isInteger(row.hy)
    && row.hy > 0
    && HEBREW_MONTHS.includes(row.hm)
    && Number.isInteger(row.hd)
    && row.hd >= 1
    && row.hd <= 30
    && (row.originalDate == null || isIsoDate(row.originalDate))
    && (row.nextIso == null || isIsoDate(row.nextIso))
    && (row.nextFormatted == null || typeof row.nextFormatted === "string"),
  );
}

export function sanitizeRemembrances(rows) {
  return rows.map(coerceRemembrance).filter(isRemembrance).slice(0, MAX_REMEMBRANCES);
}

export function assertWritableRemembrances(rows) {
  const coerced = rows.map(coerceRemembrance);
  if (coerced.some((row) => !isRemembrance(row))) {
    throw new Error("A remembrance could not be saved because it is missing required fields.");
  }
  if (coerced.length > MAX_REMEMBRANCES) {
    throw new Error(`This browser can keep up to ${MAX_REMEMBRANCES} remembrances. Export and remove a few.`);
  }
  return coerced;
}

export function serializeExport(records, exportedAt = new Date().toISOString()) {
  return {
    version: 1,
    exportedAt,
    remembrances: sanitizeRemembrances(records),
  };
}

export function parseImport(payload) {
  let parsed;
  try {
    parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch {
    throw new Error("This file is not valid JSON. Export a remembrances backup and try again.");
  }
  if (typeof parsed === "string" || parsed instanceof ArrayBuffer || ArrayBuffer.isView?.(parsed)) {
    throw new Error("This file does not contain remembrances.");
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.remembrances;
  if (!Array.isArray(rows)) throw new Error("This file does not contain remembrances.");
  const remembrances = sanitizeRemembrances(rows);
  if (!remembrances.length) throw new Error("No valid remembrances were found in this file.");
  return remembrances;
}

export function mergeImported(existing, incoming) {
  const seen = new Set(existing.map((row) => row.id));
  const added = [];
  incoming.forEach((row) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    added.push(row);
  });
  return {
    records: [...existing, ...added].slice(0, MAX_REMEMBRANCES),
    added: added.length,
    skipped: incoming.length - added.length,
  };
}

export function applyUpcomingPatches(records, updatesById) {
  return records.map((record) => {
    const patch = updatesById.get(record.id);
    return patch ? { ...record, ...patch } : record;
  });
}

export function sortByNextIso(records) {
  return [...records].sort((a, b) => (a.nextIso || "9999").localeCompare(b.nextIso || "9999"));
}
