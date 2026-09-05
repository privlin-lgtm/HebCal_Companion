import { describe, expect, it } from "vitest";
import { compareSyncVersion, shouldApplyChange, type SyncVersion } from "./sync";

describe("compareSyncVersion", () => {
  it("orders versions by counter then device id", () => {
    expect(compareSyncVersion({ counter: 2, deviceId: "a" }, { counter: 1, deviceId: "z" })).toBeGreaterThan(0);
    expect(compareSyncVersion({ counter: 2, deviceId: "a" }, { counter: 2, deviceId: "b" })).toBeLessThan(0);
  });

  it("treats identical versions as equal", () => {
    expect(compareSyncVersion({ counter: 4, deviceId: "device-a" }, { counter: 4, deviceId: "device-a" })).toBe(0);
  });
});

describe("shouldApplyChange", () => {
  it("applies only a strictly newer change", () => {
    const current: SyncVersion = { counter: 4, deviceId: "device-b" };
    expect(shouldApplyChange(current, { counter: 4, deviceId: "device-a" })).toBe(false);
    expect(shouldApplyChange(current, { counter: 5, deviceId: "device-a" })).toBe(true);
  });

  it("applies a change when there is no current version", () => {
    expect(shouldApplyChange(undefined, { counter: 1, deviceId: "device-a" })).toBe(true);
  });
});
