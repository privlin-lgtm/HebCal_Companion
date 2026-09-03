import { describe, it, expect } from "vitest";
import {
  isLocation,
  toHebcalParams,
  parseDirectLocation,
  formatGeocodeName,
  locationKey,
  DEFAULT_LOCATION,
} from "./location";

describe("isLocation", () => {
  it("validates geonameid", () => {
    expect(isLocation({ kind: "geonameid", id: "281184" })).toBe(true);
    expect(isLocation({ kind: "geonameid", id: "" })).toBe(false);
  });
  it("validates coordinates", () => {
    expect(isLocation({ kind: "coordinates", lat: 31.78, lng: 35.22, tzid: "Asia/Jerusalem" })).toBe(true);
    expect(isLocation({ kind: "coordinates", lat: NaN, lng: 35.22, tzid: "Asia/Jerusalem" })).toBe(false);
  });
  it("validates zip", () => {
    expect(isLocation({ kind: "zip", zip: "10001" })).toBe(true);
    expect(isLocation({ kind: "zip", zip: "abc" })).toBe(false);
  });
  it("validates city", () => {
    expect(isLocation({ kind: "city", code: "IL-Jerusalem" })).toBe(true);
    expect(isLocation({ kind: "city", code: "" })).toBe(false);
  });
  it("rejects null and unknown kinds", () => {
    expect(isLocation(null)).toBe(false);
    expect(isLocation({ kind: "unknown" })).toBe(false);
  });
});

describe("toHebcalParams", () => {
  it("converts geonameid", () => {
    expect(toHebcalParams(DEFAULT_LOCATION)).toEqual({ geonameid: "281184" });
  });
  it("converts coordinates", () => {
    const params = toHebcalParams({ kind: "coordinates", lat: 31.78, lng: 35.22, tzid: "Asia/Jerusalem" });
    expect(params).toEqual({ latitude: 31.78, longitude: 35.22, tzid: "Asia/Jerusalem" });
  });
  it("converts zip", () => {
    expect(toHebcalParams({ kind: "zip", zip: "10001" })).toEqual({ zip: "10001" });
  });
  it("converts city", () => {
    expect(toHebcalParams({ kind: "city", code: "IL-Jerusalem" })).toEqual({ city: "IL-Jerusalem" });
  });
  it("throws on null", () => {
    expect(() => toHebcalParams(null)).toThrow();
  });
});

describe("parseDirectLocation", () => {
  it("parses a 5-digit ZIP", () => {
    expect(parseDirectLocation("10001")).toEqual({ kind: "zip", zip: "10001" });
  });
  it("parses a 9-digit ZIP", () => {
    expect(parseDirectLocation("10001-1234")).toEqual({ kind: "zip", zip: "10001-1234" });
  });
  it("parses a city code", () => {
    expect(parseDirectLocation("IL-Jerusalem")).toEqual({ kind: "city", code: "IL-Jerusalem" });
  });
  it("returns null for empty input", () => {
    expect(parseDirectLocation("")).toBeNull();
    expect(parseDirectLocation(null)).toBeNull();
  });
});

describe("formatGeocodeName", () => {
  it("joins non-empty parts", () => {
    expect(formatGeocodeName(["Jerusalem", null, "Israel"])).toBe("Jerusalem, Israel");
  });
  it("deduplicates", () => {
    expect(formatGeocodeName(["Paris", "Paris", "France"])).toBe("Paris, France");
  });
});

describe("locationKey", () => {
  it("produces unique keys per location type", () => {
    expect(locationKey({ kind: "geonameid", id: "281184" })).toBe("geonameid:281184");
    expect(locationKey({ kind: "zip", zip: "10001" })).toBe("zip:10001");
    expect(locationKey({ kind: "city", code: "IL-Jerusalem" })).toBe("city:IL-Jerusalem");
  });
});
