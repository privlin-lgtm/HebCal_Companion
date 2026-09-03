import { beforeEach, describe, expect, it } from "vitest";
import { createSupabaseSync } from "./supabaseSync";

const CREDENTIALS = { url: "https://example.supabase.co", anonKey: "sb_publishable_test" };

describe("createSupabaseSync", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reports itself unconfigured when credentials are missing", () => {
    expect(createSupabaseSync({}).isConfigured()).toBe(false);
    expect(createSupabaseSync({ url: CREDENTIALS.url }).isConfigured()).toBe(false);
    expect(createSupabaseSync({ anonKey: CREDENTIALS.anonKey }).isConfigured()).toBe(false);
  });

  it("treats blank credentials as unconfigured", () => {
    expect(createSupabaseSync({ url: "   ", anonKey: "   " }).isConfigured()).toBe(false);
  });

  it("reports itself configured when both credentials are present", () => {
    expect(createSupabaseSync(CREDENTIALS).isConfigured()).toBe(true);
  });

  it("requires a passphrase of at least 8 characters", () => {
    const sync = createSupabaseSync(CREDENTIALS);
    expect(() => sync.unlock("short")).toThrow(/at least 8/);
    expect(sync.isUnlocked()).toBe(false);
  });

  it("tracks unlock and lock state without persisting the passphrase", () => {
    const sync = createSupabaseSync(CREDENTIALS);
    expect(sync.isUnlocked()).toBe(false);
    sync.unlock("a-long-enough-passphrase");
    expect(sync.isUnlocked()).toBe(true);

    const stored: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) stored.push(key, localStorage.getItem(key) ?? "");
    }
    expect(stored.join("|")).not.toContain("a-long-enough-passphrase");

    sync.lock();
    expect(sync.isUnlocked()).toBe(false);
  });

  it("refuses to push or pull before a passphrase is entered", async () => {
    const sync = createSupabaseSync(CREDENTIALS);
    await expect(sync.push([])).rejects.toThrow(/passphrase/);
    await expect(sync.pull()).rejects.toThrow(/passphrase/);
  });

  it("refuses to push when signed out", async () => {
    const sync = createSupabaseSync({});
    sync.unlock("a-long-enough-passphrase");
    await expect(sync.push([])).rejects.toThrow(/Sign in/);
  });

  it("resolves to no user and a no-op unsubscribe when unconfigured", async () => {
    const sync = createSupabaseSync({});
    await expect(sync.getUser()).resolves.toBeNull();
    expect(() => sync.onAuthChange(() => {})()).not.toThrow();
  });

  it("clears the passphrase on sign out even when unconfigured", async () => {
    const sync = createSupabaseSync({});
    sync.unlock("a-long-enough-passphrase");
    await sync.signOut();
    expect(sync.isUnlocked()).toBe(false);
  });

  it("reports no last sync until one happens", () => {
    expect(createSupabaseSync(CREDENTIALS).getLastSync()).toBeNull();
  });
});
