import type { StorageLike } from "../application/ports";

export type ResponseCache = {
  get<T>(key: string): T | null;
  set(key: string, value: unknown): void;
  wrapAsync<T extends object>(key: string, loader: () => Promise<T>): Promise<T & { _degraded?: boolean }>;
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type CachedEntry<T> = { _cachedAt: number; data: T };

export function createResponseCache({ storage = globalThis.localStorage, keyPrefix = "or-zarua-cache:" }: { storage?: StorageLike; keyPrefix?: string } = {}): ResponseCache {
  function storageKey(key: string) { return `${keyPrefix}${key}`; }
  function get<T>(key: string): T | null {
    try {
      const raw = storage.getItem(storageKey(key));
      if (raw == null) return null;
      const entry = JSON.parse(raw) as CachedEntry<T>;
      // Support both old format (bare data) and new format (wrapped with timestamp)
      if (entry && typeof entry._cachedAt === "number" && "data" in entry) {
        if (Date.now() - entry._cachedAt > CACHE_TTL_MS) return null;
        return entry.data;
      }
      return entry as T;
    } catch { return null; }
  }
  function set(key: string, value: unknown): void {
    try { storage.setItem(storageKey(key), JSON.stringify({ _cachedAt: Date.now(), data: value })); } catch { /* Durable cache is best-effort. */ }
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