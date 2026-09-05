/**
 * Client-side envelope encryption for synced data.
 *
 * The passphrase never leaves the device: a 256-bit AES-GCM key is derived from
 * it with PBKDF2-SHA256, and only the resulting ciphertext is uploaded. Salt and
 * IV travel inside the envelope so any device holding the passphrase can decrypt
 * without the server storing key material.
 */

import type { SyncChange, SyncVersion } from "../domain/sync";
import { isRemembrance } from "../domain/remembrance";

const KDF_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const ENVELOPE_VERSION = 1;
const MAX_ITERATIONS = 500_000;

/** Maximum allowed size (in characters) of a single encrypted sync-change payload. */
const MAX_SYNC_CHANGE_PAYLOAD = 64 * 1024;

type Envelope = {
  v: number;
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
};

function subtle(): SubtleCrypto {
  const webcrypto = globalThis.crypto;
  if (!webcrypto?.subtle) {
    throw new Error("Web Crypto is unavailable. Encrypted sync needs a secure context (HTTPS or localhost).");
  }
  return webcrypto.subtle;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Partial<Envelope>;
  return typeof e.v === "number"
    && e.kdf === "PBKDF2-SHA256"
    && typeof e.iter === "number"
    && typeof e.salt === "string"
    && typeof e.iv === "string"
    && typeof e.ct === "string";
}

/** Encrypts a JSON-serialisable value into a self-describing base64 envelope. */
export async function encryptJson(value: unknown, passphrase: string): Promise<string> {
  if (!passphrase) throw new Error("A passphrase is required to encrypt.");
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext);
  const envelope: Envelope = {
    v: ENVELOPE_VERSION,
    kdf: "PBKDF2-SHA256",
    iter: KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

/** Decrypts an envelope produced by {@link encryptJson}. */
export async function decryptJson(payload: string, passphrase: string): Promise<unknown> {
  if (!passphrase) throw new Error("A passphrase is required to decrypt.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Synced data is not in a recognised format.");
  }
  if (!isEnvelope(parsed)) throw new Error("Synced data is not in a recognised format.");
  if (parsed.v > ENVELOPE_VERSION) {
    throw new Error("This data was saved by a newer version of Or Zarua. Update the app to read it.");
  }
  if (parsed.iter > MAX_ITERATIONS) {
    throw new Error("Synced data was saved with an unusually high encryption cost. Refusing to process for safety.");
  }
  const key = await deriveKey(passphrase, fromBase64(parsed.salt), parsed.iter);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle().decrypt(
      { name: "AES-GCM", iv: fromBase64(parsed.iv) as BufferSource },
      key,
      fromBase64(parsed.ct) as BufferSource,
    );
  } catch {
    // AES-GCM authentication failure is indistinguishable from a wrong passphrase.
    throw new Error("Could not decrypt your data. Check that the passphrase matches the one used on your other device.");
  }
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ---------------------------------------------------------------------------
// Typed sync-change encryption helpers
// ---------------------------------------------------------------------------

function isSyncVersion(value: unknown): value is SyncVersion {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<SyncVersion>;
  return typeof v.counter === "number"
    && Number.isInteger(v.counter)
    && v.counter >= 0
    && typeof v.deviceId === "string"
    && v.deviceId.length > 0
    && v.deviceId.length <= 200;
}

/** Validates that a decrypted value is a well-formed {@link SyncChange}. */
function isSyncChange(value: unknown): value is SyncChange {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<SyncChange> & { kind?: unknown };
  if (typeof c.opId !== "string" || c.opId.length === 0 || c.opId.length > 200) return false;
  if (typeof c.recordId !== "string" || c.recordId.length === 0 || c.recordId.length > 80) return false;
  if (typeof c.deviceId !== "string" || c.deviceId.length === 0 || c.deviceId.length > 200) return false;
  if (!isSyncVersion(c.version)) return false;
  if (c.kind === "upsert") return isRemembrance(c.record);
  if (c.kind === "delete") return true;
  return false;
}

/**
 * Encrypts a single sync change into a self-describing envelope string.
 *
 * The plaintext change is never logged or exposed; only the ciphertext leaves
 * the device via the relay.
 */
export async function encryptSyncChange(change: SyncChange, passphrase: string): Promise<string> {
  return encryptJson(change, passphrase);
}

/**
 * Decrypts an envelope produced by {@link encryptSyncChange} and validates the
 * result is a well-formed {@link SyncChange} before returning it.
 *
 * Rejects oversized payloads, malformed envelopes, and changes whose fields
 * fail schema validation so corrupt relay rows can never reach the local store.
 */
export async function decryptSyncChange(payload: string, passphrase: string): Promise<SyncChange> {
  if (typeof payload !== "string" || payload.length > MAX_SYNC_CHANGE_PAYLOAD) {
    throw new Error("Sync change payload is missing or too large to be safe.");
  }
  const decrypted = await decryptJson(payload, passphrase);
  if (!isSyncChange(decrypted)) {
    throw new Error("Decrypted sync change failed validation.");
  }
  return decrypted;
}
