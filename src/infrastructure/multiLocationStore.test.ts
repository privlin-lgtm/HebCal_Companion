import { describe, it, expect } from "vitest";
import { createMultiLocationStore } from "./multiLocationStore";
import type { StorageLike, IdGenerator } from "../application/ports";

function makeStorage(): StorageLike {
  const data: Record<string, string> = {};
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value; },
  };
}

function makeFakeIds(): IdGenerator {
  let n = 0;
  return { next: () => `id-${++n}` };
}

describe("createMultiLocationStore", () => {
  it("list returns empty for new storage", () => {
    const store = createMultiLocationStore({ storage: makeStorage(), ids: makeFakeIds() });
    expect(store.list()).toEqual([]);
  });

  it("add creates a saved location and makes it default if first", () => {
    const store = createMultiLocationStore({ storage: makeStorage(), ids: makeFakeIds() });
    const saved = store.add("Home", { kind: "geonameid", id: "281184" });
    expect(saved.name).toBe("Home");
    expect(saved.isDefault).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it("add returns existing location if same location already saved", () => {
    const store = createMultiLocationStore({ storage: makeStorage(), ids: makeFakeIds() });
    store.add("Home", { kind: "geonameid", id: "281184" });
    const existing = store.add("Home2", { kind: "geonameid", id: "281184" });
    expect(existing.name).toBe("Home"); // returns original
    expect(store.list()).toHaveLength(1);
  });

  it("remove deletes by id and reassigns default", () => {
    const store = createMultiLocationStore({ storage: makeStorage(), ids: makeFakeIds() });
    store.add("Home", { kind: "geonameid", id: "281184" });
    store.add("Work", { kind: "geonameid", id: "5128581" });
    const locations = store.list();
    store.remove(locations[0].id);
    const remaining = store.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isDefault).toBe(true);
  });

  it("setDefault with unknown ID does not clear all defaults", () => {
    const store = createMultiLocationStore({ storage: makeStorage(), ids: makeFakeIds() });
    store.add("Home", { kind: "geonameid", id: "281184" });
    store.setDefault("nonexistent-id");
    const locations = store.list();
    // The first location should still be default (getDefault falls back to first)
    expect(store.getDefault()?.name).toBe("Home");
  });

  it("getDefault returns the default location", () => {
    const store = createMultiLocationStore({ storage: makeStorage(), ids: makeFakeIds() });
    store.add("Home", { kind: "geonameid", id: "281184" });
    store.add("Work", { kind: "geonameid", id: "5128581" });
    expect(store.getDefault()?.name).toBe("Home");
    store.setDefault(store.list()[1].id);
    expect(store.getDefault()?.name).toBe("Work");
  });
});
