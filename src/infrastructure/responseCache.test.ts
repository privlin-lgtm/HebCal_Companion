import { describe, it, expect, vi } from "vitest";
import { createResponseCache } from "./responseCache";
import type { StorageLike } from "../application/ports";

function makeStorage(): StorageLike & { _data: Record<string, string> } {
  const _data: Record<string, string> = {};
  return {
    _data,
    getItem: (key: string) => _data[key] ?? null,
    setItem: (key: string, value: string) => { _data[key] = value; },
  };
}

describe("createResponseCache", () => {
  it("returns null for missing keys", () => {
    const cache = createResponseCache({ storage: makeStorage() });
    expect(cache.get("missing")).toBeNull();
  });

  it("stores and retrieves values", () => {
    const storage = makeStorage();
    const cache = createResponseCache({ storage });
    cache.set("key", { a: 1 });
    expect(cache.get("key")).toEqual({ a: 1 });
  });

  it("wrapAsync stores the result on success", async () => {
    const storage = makeStorage();
    const cache = createResponseCache({ storage });
    const loader = vi.fn().mockResolvedValue({ data: "hello" });
    const result = await cache.wrapAsync("test", loader);
    expect(result).toEqual({ data: "hello" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("wrapAsync returns cached data with _degraded on failure", async () => {
    const storage = makeStorage();
    const cache = createResponseCache({ storage });
    cache.set("test", { data: "cached" });
    const loader = vi.fn().mockRejectedValue(new Error("network"));
    const result = await cache.wrapAsync("test", loader);
    expect(result).toEqual({ data: "cached", _degraded: true });
  });

  it("wrapAsync rethrows when no cache exists", async () => {
    const cache = createResponseCache({ storage: makeStorage() });
    const loader = vi.fn().mockRejectedValue(new Error("network"));
    await expect(cache.wrapAsync("test", loader)).rejects.toThrow("network");
  });

  it("does not persist already-degraded payloads as fresh", async () => {
    const storage = makeStorage();
    const cache = createResponseCache({ storage });
    const loader = vi.fn().mockResolvedValue({ data: "fresh", _degraded: true });
    await cache.wrapAsync("test", loader);
    const stored = cache.get("test");
    expect(stored).toEqual({ data: "fresh" });
    expect(stored).not.toHaveProperty("_degraded");
  });
});
