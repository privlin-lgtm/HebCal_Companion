import { describe, it, expect, vi } from "vitest";
import { createHttpClient } from "./httpClient";

function makeResponse(ok: boolean, status: number, json: unknown) {
  return { ok, status, json: () => Promise.resolve(json) } as unknown as Response;
}

describe("createHttpClient", () => {
  it("returns parsed JSON on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(true, 200, { hello: "world" }));
    const http = createHttpClient({ fetchImpl });
    const result = await http("https://example.com", { label: "Test" });
    expect(result).toEqual({ hello: "world" });
  });

  it("throws on 429 with a friendly message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(false, 429, {}));
    const http = createHttpClient({ fetchImpl });
    await expect(http("https://example.com", { label: "Test" })).rejects.toThrow("temporarily busy");
  });

  it("throws on 500 with status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(false, 500, {}));
    const http = createHttpClient({ fetchImpl });
    await expect(http("https://example.com", { label: "Test" })).rejects.toThrow("500");
  });

  it("throws on network error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("Network error"));
    const http = createHttpClient({ fetchImpl });
    await expect(http("https://example.com", { label: "Test" })).rejects.toThrow("Could not reach Test");
  });

  it("rethrows AbortError without wrapping", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    const fetchImpl = vi.fn().mockRejectedValue(abortError);
    const http = createHttpClient({ fetchImpl });
    await expect(http("https://example.com")).rejects.toThrow("Aborted");
  });

  it("throws on invalid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.reject(new Error("bad json")),
    } as unknown as Response);
    const http = createHttpClient({ fetchImpl });
    await expect(http("https://example.com", { label: "Test" })).rejects.toThrow("unexpected response");
  });
});
