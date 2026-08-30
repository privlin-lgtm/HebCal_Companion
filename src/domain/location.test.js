import { describe, expect, it } from "vitest";
import { isLocation, parseDirectLocation, toHebcalParams } from "./location.js";

describe("location domain", () => {
  it("maps tagged locations to Hebcal params", () => {
    expect(toHebcalParams({ kind: "geonameid", id: "281184" })).toEqual({ geonameid: "281184" });
    expect(toHebcalParams({ kind: "zip", zip: "10001" })).toEqual({ zip: "10001" });
    expect(toHebcalParams({ kind: "city", code: "IL-Jerusalem" })).toEqual({ city: "IL-Jerusalem" });
    expect(toHebcalParams({ kind: "coordinates", lat: 1, lng: 2, tzid: "UTC" }))
      .toEqual({ latitude: 1, longitude: 2, tzid: "UTC" });
  });

  it("parses direct location input and validates shapes", () => {
    expect(parseDirectLocation("10001-1234")).toEqual({ kind: "zip", zip: "10001-1234" });
    expect(parseDirectLocation(" IL-Jerusalem ")).toEqual({ kind: "city", code: "IL-Jerusalem" });
    expect(parseDirectLocation("   ")).toBeNull();
    expect(isLocation({ kind: "zip", zip: "1000" })).toBe(false);
    expect(() => toHebcalParams(null)).toThrow(/city/i);
  });
});
