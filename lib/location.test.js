import { describe, expect, it } from "vitest";
import { isLocation, parseDirectLocation, toHebcalParams } from "./location.js";

describe("toHebcalParams", () => {
  it("maps a tagged location to Hebcal query params", () => {
    expect(toHebcalParams({ kind: "geonameid", id: "281184" })).toEqual({ geonameid: "281184" });
    expect(toHebcalParams({ kind: "zip", zip: "10001" })).toEqual({ zip: "10001" });
    expect(toHebcalParams({ kind: "city", code: "IL-Jerusalem" })).toEqual({ city: "IL-Jerusalem" });
    expect(toHebcalParams({
      kind: "coordinates",
      lat: 48.8566,
      lng: 2.3522,
      tzid: "Europe/Paris",
    })).toEqual({
      latitude: 48.8566,
      longitude: 2.3522,
      tzid: "Europe/Paris",
    });
  });

  it("rejects an unknown location", () => {
    expect(() => toHebcalParams({ kind: "planet" })).toThrow(/city/i);
  });
});

describe("parseDirectLocation", () => {
  it("treats a 5-digit or ZIP+4 value as a ZIP", () => {
    expect(parseDirectLocation("10001")).toEqual({ kind: "zip", zip: "10001" });
    expect(parseDirectLocation("10001-1234")).toEqual({ kind: "zip", zip: "10001-1234" });
  });

  it("treats other values as Hebcal city codes", () => {
    expect(parseDirectLocation(" IL-Jerusalem ")).toEqual({ kind: "city", code: "IL-Jerusalem" });
  });

  it("returns null for an empty value", () => {
    expect(parseDirectLocation("   ")).toBeNull();
  });
});

describe("isLocation", () => {
  it("accepts known location shapes", () => {
    expect(isLocation({ kind: "geonameid", id: "5128581" })).toBe(true);
    expect(isLocation({ kind: "zip", zip: "10001" })).toBe(true);
    expect(isLocation({ kind: "city", code: "IL-Jerusalem" })).toBe(true);
    expect(isLocation({ kind: "coordinates", lat: 1, lng: 2, tzid: "UTC" })).toBe(true);
  });

  it("rejects incomplete coordinates and unknown kinds", () => {
    expect(isLocation({ kind: "coordinates", lat: 1, lng: 2 })).toBe(false);
    expect(isLocation({ kind: "geonameid", id: "" })).toBe(false);
    expect(isLocation(null)).toBe(false);
  });
});
