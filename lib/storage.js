import { isLocation } from "./location.js";

export const HEBREW_MONTHS = [
  "Tishrei", "Cheshvan", "Kislev", "Tevet", "Sh'vat",
  "Adar", "Adar I", "Adar II",
  "Nisan", "Iyyar", "Sivan", "Tamuz", "Av", "Elul",
];

export const STORAGE_KEY = "or-zarua-remembrances-v1";
export const LOCATION_KEY = "or-zarua-last-location-v1";
export const MAX_REMEMBRANCES = 200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function defaultStorage() {
  return globalThis.localStorage;
}

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

export function readRemembrances(storage = defaultStorage()) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(coerceRemembrance)
      .filter(isRemembrance)
      .slice(0, MAX_REMEMBRANCES);
  } catch {
    return [];
  }
}

export function writeRemembrances(records, storage = defaultStorage()) {
  const coerced = records.map(coerceRemembrance);
  if (coerced.some((row) => !isRemembrance(row))) {
    throw new Error("A remembrance could not be saved because it is missing required fields.");
  }
  if (coerced.length > MAX_REMEMBRANCES) {
    throw new Error(`This browser can keep up to ${MAX_REMEMBRANCES} remembrances. Export and remove a few.`);
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(coerced));
  } catch (error) {
    if (error.name === "QuotaExceededError") {
      throw new Error("This browser is out of space for saved remembrances. Export and remove a few.");
    }
    throw new Error("Saved remembrances could not be written to this browser.");
  }
  return coerced;
}

export function mergeUpcomingDates(updatesById, storage = defaultStorage()) {
  const current = readRemembrances(storage);
  const next = current.map((record) => {
    const patch = updatesById.get(record.id);
    return patch ? { ...record, ...patch } : record;
  });
  return writeRemembrances(next, storage);
}

export function readLastLocation(storage = defaultStorage()) {
  try {
    const parsed = JSON.parse(storage.getItem(LOCATION_KEY) || "null");
    if (!parsed || typeof parsed.name !== "string" || !isLocation(parsed.location)) return null;
    return { name: parsed.name, location: parsed.location };
  } catch {
    return null;
  }
}

export function writeLastLocation(location, name, storage = defaultStorage()) {
  if (!isLocation(location) || typeof name !== "string") return;
  try {
    storage.setItem(LOCATION_KEY, JSON.stringify({ location, name }));
  } catch {
    // Location memory is optional; ignore quota or private-mode failures.
  }
}

export function serializeExport(records, exportedAt = new Date().toISOString()) {
  return {
    version: 1,
    exportedAt,
    remembrances: records.map(coerceRemembrance).filter(isRemembrance),
  };
}

export function parseImport(payload) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const rows = Array.isArray(parsed) ? parsed : parsed?.remembrances;
  if (!Array.isArray(rows)) throw new Error("This file does not contain remembrances.");
  const remembrances = rows.map(coerceRemembrance).filter(isRemembrance);
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
