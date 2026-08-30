import { afterEach, describe, expect, it, vi } from "vitest";
import { clearConverterCache, convert, converterCacheKey, hebcalUrl, httpJson } from "./http.js";

afterEach(() => {
  vi.unstubAllGlobals();
  clearConverterCache();
});

describe("converterCacheKey", () => {
  it("is stable regardless of key order", () => {
    expect(converterCacheKey({ g2h: 1, gy: 2026 })).toBe(converterCacheKey({ gy: 2026, g2h: 1 }));
  });
});

describe("hebcalUrl", () => {
  it("builds a JSON converter URL", () => {
    const url = hebcalUrl("/converter", { gy: 2026, gm: 8, gd: 30, g2h: 1 });
    expect(url.origin).toBe("https://www.hebcal.com");
    expect(url.searchParams.get("cfg")).toBe("json");
    expect(url.searchParams.get("gy")).toBe("2026");
  });
});

describe("httpJson", () => {
  it("maps network failure, 429, and bad JSON to user-facing errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(httpJson("https://example.com", { label: "Hebcal" })).rejects.toThrow(/Could not reach Hebcal/);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(httpJson("https://example.com", { label: "Hebcal" })).rejects.toThrow(/temporarily busy/);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    }));
    await expect(httpJson("https://example.com", { label: "Hebcal" })).rejects.toThrow(/unexpected response/);
  });

  it("rethrows AbortError so callers can ignore stale requests", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(httpJson("https://example.com")).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("convert", () => {
  it("reuses an in-flight converter request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hy: 5786, hebrew: "ט״ז באלול" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const params = { gy: 2026, gm: 8, gd: 30, g2h: 1 };
    const [first, second] = await Promise.all([convert(params), convert(params)]);
    expect(first.hy).toBe(5786);
    expect(second.hy).toBe(5786);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
