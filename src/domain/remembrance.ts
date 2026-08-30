import type { Remembrance, RemembranceType } from "../application/ports";

/** Remembrance entity rules — no I/O. */

export const HEBREW_MONTHS = Object.freeze([
  "Tishrei", "Cheshvan", "Kislev", "Tevet", "Sh'vat",
  "Adar", "Adar I", "Adar II",
  "Nisan", "Iyyar", "Sivan", "Tamuz", "Av", "Elul",
] as const);

export type HebrewMonth = (typeof HEBREW_MONTHS)[number];

export const MAX_REMEMBRANCES = 200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

export type RemembranceInput = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  hy?: unknown;
  hm?: unknown;
  hd?: unknown;
  originalDate?: unknown;
  nextIso?: unknown;
  nextFormatted?: unknown;
};

export function coerceRemembrance(row: RemembranceInput | null | undefined): Remembrance | null {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id as string,
    name: typeof row.name === "string" ? row.name.trim() : (row.name as string),
    type: row.type as RemembranceType,
    hy: Number(row.hy),
    hm: row.hm as string,
    hd: Number(row.hd),
    originalDate: row.originalDate as string | null | undefined,
    nextIso: row.nextIso as string | null | undefined,
    nextFormatted: row.nextFormatted as string | null | undefined,
  };
}

export function isRemembrance(row: Remembrance | null | undefined): row is Remembrance {
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
    && (HEBREW_MONTHS as readonly string[]).includes(row.hm)
    && Number.isInteger(row.hd)
    && row.hd >= 1
    && row.hd <= 30
    && (row.originalDate == null || isIsoDate(row.originalDate))
    && (row.nextIso == null || isIsoDate(row.nextIso))
    && (row.nextFormatted == null || typeof row.nextFormatted === "string"),
  );
}

export function sanitizeRemembrances(rows: RemembranceInput[]): Remembrance[] {
  return rows.map(coerceRemembrance).filter(isRemembrance).slice(0, MAX_REMEMBRANCES);
}

export function assertWritableRemembrances(rows: RemembranceInput[]): Remembrance[] {
  const coerced = rows.map(coerceRemembrance);
  if (coerced.some((row) => !isRemembrance(row))) {
    throw new Error("A remembrance could not be saved because it is missing required fields.");
  }
  if (coerced.length > MAX_REMEMBRANCES) {
    throw new Error(`This browser can keep up to ${MAX_REMEMBRANCES} remembrances. Export and remove a few.`);
  }
  return coerced as Remembrance[];
}

export type RemembranceExport = {
  version: 1;
  exportedAt: string;
  remembrances: Remembrance[];
};

export function serializeExport(records: RemembranceInput[], exportedAt = new Date().toISOString()): RemembranceExport {
  return {
    version: 1,
    exportedAt,
    remembrances: sanitizeRemembrances(records),
  };
}

export function parseImport(payload: unknown): Remembrance[] {
  let parsed: unknown;
  try {
    parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch {
    throw new Error("This file is not valid JSON. Export a remembrances backup and try again.");
  }
  if (typeof parsed === "string" || parsed instanceof ArrayBuffer || ArrayBuffer.isView(parsed)) {
    throw new Error("This file does not contain remembrances.");
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : (parsed as { remembrances?: unknown } | null)?.remembrances;
  if (!Array.isArray(rows)) throw new Error("This file does not contain remembrances.");
  const remembrances = sanitizeRemembrances(rows);
  if (!remembrances.length) throw new Error("No valid remembrances were found in this file.");
  return remembrances;
}

export function mergeImported(existing: Remembrance[], incoming: Remembrance[]) {
  const seen = new Set(existing.map((row) => row.id));
  const added: Remembrance[] = [];
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

export function applyUpcomingPatches(
  records: Remembrance[],
  updatesById: Map<string, Partial<Remembrance>>,
): Remembrance[] {
  return records.map((record) => {
    const patch = updatesById.get(record.id);
    return patch ? { ...record, ...patch } : record;
  });
}

export function sortByNextIso(records: Remembrance[]): Remembrance[] {
  return [...records].sort((a, b) => (a.nextIso || "9999").localeCompare(b.nextIso || "9999"));
}
