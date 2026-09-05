import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseSync } from "./supabaseSync";
import { encryptSyncChange } from "./crypto";
import type { EncryptedSyncChange, SyncChange } from "../domain/sync";
import type { SyncUser } from "../application/ports";

const CREDENTIALS = { url: "https://example.supabase.co", anonKey: "sb_publishable_test" };
const PASSPHRASE = "a-long-enough-passphrase";
const USER: SyncUser = { id: "user-123", email: "test@example.com" };

// ---------------------------------------------------------------------------
// Mock Supabase client helpers
// ---------------------------------------------------------------------------

/** A chainable, thenable query-builder mock that resolves to `result`. */
function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.gt = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.upsert = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.maybeSingle = vi.fn(chain);
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function createMockClient(syncChangesResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  const syncBuilder = createQueryBuilder(syncChangesResult);
  const client = {
    from: vi.fn((_table: string) => syncBuilder),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  };
  return { client: client as never, syncBuilder };
}

/** A valid upsert change carrying a plaintext name that must never reach the relay. */
function sampleChange(name = "Rivka bat Avraham"): SyncChange {
  return {
    opId: "op-1",
    recordId: "rec-1",
    deviceId: "device-a",
    version: { counter: 1, deviceId: "device-a" },
    kind: "upsert",
    record: {
      id: "rec-1",
      name,
      type: "Yahrzeit",
      hy: 5784,
      hm: "Tishrei",
      hd: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Existing configuration / passphrase tests (unchanged behaviour)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Encrypted relay (SyncRelay) tests
// ---------------------------------------------------------------------------

describe("createSupabaseSync relay", () => {
  it("pushes encrypted changes containing only pending operations", async () => {
    const { client, syncBuilder } = createMockClient();
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    const change = sampleChange("Rivka bat Avraham");
    const data = await encryptSyncChange(change, PASSPHRASE);
    const encrypted: EncryptedSyncChange = { opId: change.opId, data };

    await sync.relay.push(USER, [encrypted]);

    expect(syncBuilder.upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = (syncBuilder.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: USER.id, op_id: "op-1" });
    // The plaintext name must never appear in the row sent to the relay.
    expect(JSON.stringify(rows)).not.toContain("Rivka");
    expect(JSON.stringify(rows)).not.toContain("bat Avraham");
    // Duplicate inserts must be configured to be ignored.
    expect(options).toMatchObject({ onConflict: "user_id,op_id", ignoreDuplicates: true });
  });

  it("does not call the relay when pushing zero changes", async () => {
    const { client, syncBuilder } = createMockClient();
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    await sync.relay.push(USER, []);
    expect(syncBuilder.upsert).not.toHaveBeenCalled();
  });

  it("pulls encrypted rows after the requested cursor and returns the highest sequence", async () => {
    const rows = [
      { sequence: 1, op_id: "op-a", data: "encrypted-a" },
      { sequence: 2, op_id: "op-b", data: "encrypted-b" },
      { sequence: 3, op_id: "op-c", data: "encrypted-c" },
    ];
    const { client, syncBuilder } = createMockClient({ data: rows, error: null });
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    const result = await sync.relay.pull(USER, { sequence: 0 });

    expect(result.changes).toHaveLength(3);
    expect(result.changes[0]).toMatchObject({ opId: "op-a", data: "encrypted-a", sequence: 1 });
    expect(result.changes[2]).toMatchObject({ opId: "op-c", data: "encrypted-c", sequence: 3 });
    expect(result.cursor).toEqual({ sequence: 3 });

    // Verify the query chain used the cursor and user filter.
    expect(syncBuilder.gt).toHaveBeenCalledWith("sequence", 0);
    expect(syncBuilder.eq).toHaveBeenCalledWith("user_id", USER.id);
    expect(syncBuilder.order).toHaveBeenCalledWith("sequence", { ascending: true });
  });

  it("returns the same cursor and empty changes when there is no data", async () => {
    const { client } = createMockClient({ data: [], error: null });
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    const result = await sync.relay.pull(USER, { sequence: 42 });
    expect(result.changes).toEqual([]);
    expect(result.cursor).toEqual({ sequence: 42 });
  });

  it("caps the response at 100 rows and returns the highest sequence among them", async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({
      sequence: i + 1,
      op_id: `op-${i}`,
      data: `data-${i}`,
    }));
    const { client } = createMockClient({ data: rows, error: null });
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    const result = await sync.relay.pull(USER, { sequence: 0 });
    expect(result.changes).toHaveLength(100);
    expect(result.cursor).toEqual({ sequence: 100 });
  });

  it("rejects malformed remote rows missing required fields", async () => {
    const rows = [{ sequence: 1, op_id: "op-a", data: "" /* empty data */ }];
    const { client } = createMockClient({ data: rows, error: null });
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    await expect(sync.relay.pull(USER, { sequence: 0 })).rejects.toThrow(/malformed|oversized/);
  });

  it("rejects rows with a non-string op_id", async () => {
    const rows = [{ sequence: 1, op_id: 123, data: "valid-data" }];
    const { client } = createMockClient({ data: rows, error: null });
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    await expect(sync.relay.pull(USER, { sequence: 0 })).rejects.toThrow(/malformed|oversized/);
  });

  it("rejects oversized remote payloads", async () => {
    const oversized = "x".repeat(64 * 1024 + 1);
    const rows = [{ sequence: 1, op_id: "op-a", data: oversized }];
    const { client } = createMockClient({ data: rows, error: null });
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    await expect(sync.relay.pull(USER, { sequence: 0 })).rejects.toThrow(/malformed|oversized/);
  });

  it("rejects oversized payloads on push", async () => {
    const { client } = createMockClient();
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    const oversized = "x".repeat(64 * 1024 + 1);
    const encrypted: EncryptedSyncChange = { opId: "op-1", data: oversized };

    await expect(sync.relay.push(USER, [encrypted])).rejects.toThrow(/oversized|invalid/);
  });

  it("treats duplicate operation ids as idempotent", async () => {
    const { client, syncBuilder } = createMockClient();
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    const change = sampleChange();
    const data = await encryptSyncChange(change, PASSPHRASE);
    const encrypted: EncryptedSyncChange = { opId: "dup-op", data };

    // Push the same opId twice — both should be sent in one upsert call
    // with ignoreDuplicates so the server silently drops the second.
    await sync.relay.push(USER, [encrypted, { ...encrypted }]);

    expect(syncBuilder.upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = (syncBuilder.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(rows[0].op_id).toBe("dup-op");
    expect(rows[1].op_id).toBe("dup-op");
    expect(options).toMatchObject({ onConflict: "user_id,op_id", ignoreDuplicates: true });
  });

  it("exposes relay methods directly as pushChanges and pullChanges", async () => {
    const { client } = createMockClient({ data: [], error: null });
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    expect(typeof sync.pushChanges).toBe("function");
    expect(typeof sync.pullChanges).toBe("function");
    expect(sync.relay.isConfigured()).toBe(true);

    const result = await sync.pullChanges(USER, { sequence: 0 });
    expect(result.changes).toEqual([]);
  });

  it("rejects relay push when not configured", async () => {
    const sync = createSupabaseSync({});
    await expect(sync.relay.push(USER, [{ opId: "op-1", data: "x" }])).rejects.toThrow(/not configured/);
  });

  it("rejects relay pull when not configured", async () => {
    const sync = createSupabaseSync({});
    await expect(sync.relay.pull(USER, { sequence: 0 })).rejects.toThrow(/not configured/);
  });

  it("propagates relay push errors", async () => {
    const { client } = createMockClient({ data: null, error: { message: "rate limited" } });
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    await expect(
      sync.relay.push(USER, [{ opId: "op-1", data: "encrypted" }]),
    ).rejects.toThrow(/rate limited/);
  });

  it("propagates relay pull errors", async () => {
    const { client } = createMockClient({ data: null, error: { message: "network error" } });
    const sync = createSupabaseSync({ ...CREDENTIALS, client });

    await expect(sync.relay.pull(USER, { sequence: 0 })).rejects.toThrow(/network error/);
  });
});
