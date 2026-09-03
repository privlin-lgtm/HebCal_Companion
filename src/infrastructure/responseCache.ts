import type { StorageLike } from "../application/ports";

export type ResponseCache = {
  get<T>(key: string): T | null;
  set(key: string, value: unknown): void;
  wrapAsync<T extends object>(key: string, loader: () => Promise<T>): Promise<T & { _degraded?: boolean }>;
};

export function createResponseCache({ storage = globalThis.localStorage, keyPrefix = "or-zarua-cache:" }: { storage?: StorageLike; keyPrefix?: string } = {}): ResponseCache {
  function storageKey(key: string) { return `${keyPrefix}${key}`; }
  function get<T>(key: string): T | null {
    try { const raw = storage.getItem(storageKey(key)); if (raw == null) return null; return JSON.parse(raw) as T; }
    catch { return null; }
  }
  function set(key: string, value: unknown): void {
    try { storage.setItem(storageKey(key), JSON.stringify(value)); } catch { /* Durable cache is best-effort. */ }
  }
  async function wrapAsync<T extends object>(key: string, loader: () => Promise<T>): Promise<T & { _degraded?: boolean }> {
    try {
      const value = await loader();
      const { _degraded: _ignored, ...toStore } = value as T & { _degraded?: boolean };
      void _ignored;
      set(key, toStore);
      return value;
    } catch (error) {
      const cached = get<T>(key);
      if (cached != null) return { ...cached, _degraded: true };
      throw error;
    }
  }
  return { get, set, wrapAsync };
}