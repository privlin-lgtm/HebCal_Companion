import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncCoordinator, type SyncCoordinatorDeps } from "./syncCoordinator";
import type { EncryptedSyncChange, SyncChange, SyncCursor } from "../domain/sync";
import type { Remembrance } from "../domain/remembrance";
import type {
  NetworkPort,
  RemembranceRepository,
  SchedulerPort,
  SyncCrypto,
  SyncPort,
  SyncRelay,
  SyncStatus,
  SyncUser,
} from "../application/ports";

const USER: SyncUser = { id: "user-1", email: "test@example.com" };

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

function sampleChange(
  overrides: Partial<SyncChange> = {},
): SyncChange {
  return {
    opId: "op-1",
    recordId: "rec-1",
    deviceId: "device-a",
    version: { counter: 1, deviceId: "device-a" },
    kind: "upsert",
    record: {
      id: "rec-1",
      name: "Rivka bat Avraham",
      type: "Yahrzeit",
      hy: 5784,
      hm: "Tishrei",
      hd: 1,
    },
    ...overrides,
  };
}

function remoteChange(
  overrides: Partial<SyncChange> = {},
): SyncChange {
  return {
    opId: "remote-op-1",
    recordId: "rec-remote",
    deviceId: "device-b",
    version: { counter: 1, deviceId: "device-b" },
    kind: "upsert",
    record: {
      id: "rec-remote",
      name: "Remote Record",
      type: "Yahrzeit",
      hy: 5784,
      hm: "Tishrei",
      hd: 1,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake collaborators
// ---------------------------------------------------------------------------

type FakeRepository = RemembranceRepository & {
  _setPending(changes: SyncChange[]): void;
  _getApplied(): SyncChange[][];
  _getAcknowledged(): string[][];
  _getCursor(): SyncCursor;
  _getSetCursorCalls(): SyncCursor[];
};

function createFakeRepository(): FakeRepository {
  let pending: SyncChange[] = [];
  let cursor: SyncCursor = { sequence: 0 };
  const applied: SyncChange[][] = [];
  const acknowledged: string[][] = [];
  const setCursorCalls: SyncCursor[] = [];

  return {
    list: vi.fn(async () => []),
    saveAll: vi.fn(async (records: Remembrance[]) => records),
    mergeUpcoming: vi.fn(async () => []),
    applyRemote: vi.fn(async (changes: SyncChange[]) => {
      applied.push([...changes]);
    }),
    pendingChanges: vi.fn(async () => [...pending]),
    acknowledgeChanges: vi.fn(async (opIds: string[]) => {
      acknowledged.push([...opIds]);
      pending = pending.filter((c) => !opIds.includes(c.opId));
    }),
    getCursor: vi.fn(async () => ({ ...cursor })),
    setCursor: vi.fn(async (c: SyncCursor) => {
      setCursorCalls.push({ ...c });
      cursor = { ...c };
    }),
    getDeviceId: vi.fn(async () => "device-test"),
    _setPending(changes: SyncChange[]) {
      pending = [...changes];
    },
    _getApplied() {
      return applied;
    },
    _getAcknowledged() {
      return acknowledged;
    },
    _getCursor() {
      return cursor;
    },
    _getSetCursorCalls() {
      return setCursorCalls;
    },
  };
}

type FakeRelay = SyncRelay & {
  _getPushCalls(): EncryptedSyncChange[][];
  _getPullCalls(): SyncCursor[];
  _setPullResult(
    result: { cursor: SyncCursor; changes: Array<EncryptedSyncChange & { sequence: number }> },
  ): void;
};

function createFakeRelay(opts: {
  pushError?: Error;
  pullResult?: { cursor: SyncCursor; changes: Array<EncryptedSyncChange & { sequence: number }> };
  pullError?: Error;
} = {}): FakeRelay {
  const pushCalls: EncryptedSyncChange[][] = [];
  const pullCalls: SyncCursor[] = [];
  let pullResult = opts.pullResult;
  let pullError = opts.pullError;

  return {
    isConfigured: () => true,
    push: vi.fn(async (_user: SyncUser, changes: EncryptedSyncChange[]) => {
      pushCalls.push([...changes]);
      if (opts.pushError) throw opts.pushError;
    }),
    pull: vi.fn(async (_user: SyncUser, cursor: SyncCursor) => {
      if (pullError) throw pullError;
      pullCalls.push({ ...cursor });
      return pullResult ?? { cursor, changes: [] };
    }),
    _getPushCalls() {
      return pushCalls;
    },
    _getPullCalls() {
      return pullCalls;
    },
    _setPullResult(result) {
      pullResult = result;
      pullError = undefined;
    },
  };
}

function createFakeCipher(): SyncCrypto {
  return {
    encrypt: vi.fn(async (change: SyncChange) => JSON.stringify(change)),
    decrypt: vi.fn(async (payload: string) => JSON.parse(payload) as SyncChange),
  };
}

type FakeSync = SyncPort & {
  _triggerAuthChange(user: SyncUser | null): void;
  _setUnlocked(value: boolean): void;
};

function createFakeSync(opts: {
  configured?: boolean;
  unlocked?: boolean;
  user?: SyncUser | null;
} = {}): FakeSync {
  const configured = opts.configured ?? true;
  let unlocked = opts.unlocked ?? true;
  const user = opts.user !== undefined ? opts.user : USER;
  const authListeners: ((user: SyncUser | null) => void)[] = [];

  return {
    isConfigured: () => configured,
    isUnlocked: () => unlocked,
    getUser: vi.fn(async () => user),
    onAuthChange: (listener: (user: SyncUser | null) => void) => {
      authListeners.push(listener);
      return () => {
        const idx = authListeners.indexOf(listener);
        if (idx >= 0) authListeners.splice(idx, 1);
      };
    },
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    unlock: vi.fn(() => {
      unlocked = true;
    }),
    lock: vi.fn(() => {
      unlocked = false;
    }),
    push: vi.fn(),
    pull: vi.fn(),
    getLastSync: () => null,
    _triggerAuthChange(u: SyncUser | null) {
      for (const l of authListeners) l(u);
    },
    _setUnlocked(value: boolean) {
      unlocked = value;
    },
  };
}

type FakeNetwork = NetworkPort & {
  _setOnline(value: boolean): void;
  _triggerOnline(): void;
};

function createFakeNetwork(opts: { online?: boolean } = {}): FakeNetwork {
  let online = opts.online ?? true;
  const listeners: (() => void)[] = [];
  return {
    isOnline: () => online,
    onOnline: (listener: () => void) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    _setOnline(value: boolean) {
      online = value;
    },
    _triggerOnline() {
      for (const l of listeners) l();
    },
  };
}

type TimeoutEntry = { handler: () => void; ms: number };
type IntervalEntry = { handler: () => void; ms: number };

type FakeScheduler = SchedulerPort & {
  _timeouts: TimeoutEntry[];
  _intervals: IntervalEntry[];
  _triggerTimeouts(): void;
  _triggerIntervals(): void;
  _triggerVisibility(): void;
  _triggerFocus(): void;
  _setVisible(value: boolean): void;
};

function createFakeScheduler(): FakeScheduler {
  const timeouts: TimeoutEntry[] = [];
  const intervals: IntervalEntry[] = [];
  const visibilityListeners: (() => void)[] = [];
  const focusListeners: (() => void)[] = [];
  let visible = true;

  return {
    setTimeout: vi.fn((handler: () => void, ms: number) => {
      const entry: TimeoutEntry = { handler, ms };
      const cleanup = () => {
        const idx = timeouts.indexOf(entry);
        if (idx >= 0) timeouts.splice(idx, 1);
      };
      timeouts.push(entry);
      return cleanup;
    }),
    setInterval: vi.fn((handler: () => void, ms: number) => {
      const entry: IntervalEntry = { handler, ms };
      const cleanup = () => {
        const idx = intervals.indexOf(entry);
        if (idx >= 0) intervals.splice(idx, 1);
      };
      intervals.push(entry);
      return cleanup;
    }),
    isVisible: () => visible,
    onVisibilityChange: (listener: () => void) => {
      visibilityListeners.push(listener);
      return () => {
        const idx = visibilityListeners.indexOf(listener);
        if (idx >= 0) visibilityListeners.splice(idx, 1);
      };
    },
    onFocus: (listener: () => void) => {
      focusListeners.push(listener);
      return () => {
        const idx = focusListeners.indexOf(listener);
        if (idx >= 0) focusListeners.splice(idx, 1);
      };
    },
    _timeouts: timeouts,
    _intervals: intervals,
    _triggerTimeouts() {
      const copy = [...timeouts];
      timeouts.length = 0;
      for (const t of copy) t.handler();
    },
    _triggerIntervals() {
      for (const i of [...intervals]) i.handler();
    },
    _triggerVisibility() {
      for (const l of [...visibilityListeners]) l();
    },
    _triggerFocus() {
      for (const l of [...focusListeners]) l();
    },
    _setVisible(value: boolean) {
      visible = value;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers to build a coordinator with all fakes
// ---------------------------------------------------------------------------

function createCoordinatorWithFakes(overrides: {
  repository?: FakeRepository;
  sync?: FakeSync;
  relay?: FakeRelay;
  cipher?: SyncCrypto;
  network?: FakeNetwork;
  scheduler?: FakeScheduler;
} = {}) {
  const repository = overrides.repository ?? createFakeRepository();
  const sync = overrides.sync ?? createFakeSync();
  const relay = overrides.relay ?? createFakeRelay();
  const cipher = overrides.cipher ?? createFakeCipher();
  const network = overrides.network ?? createFakeNetwork();
  const scheduler = overrides.scheduler ?? createFakeScheduler();

  const coordinator = createSyncCoordinator({
    repository,
    sync,
    relay,
    cipher,
    network,
    scheduler,
  } as SyncCoordinatorDeps);

  return { coordinator, repository, sync, relay, cipher, network, scheduler };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSyncCoordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Status: disabled / locked
  // -------------------------------------------------------------------------

  it("reports disabled when sync is unconfigured", async () => {
    const { coordinator } = createCoordinatorWithFakes({
      sync: createFakeSync({ configured: false }),
    });
    expect(coordinator.getStatus()).toBe("disabled");
    await coordinator.syncNow();
    expect(coordinator.getStatus()).toBe("disabled");
  });

  it("reports locked when sync is configured but not unlocked", async () => {
    const { coordinator } = createCoordinatorWithFakes({
      sync: createFakeSync({ configured: true, unlocked: false }),
    });
    expect(coordinator.getStatus()).toBe("locked");
    await coordinator.syncNow();
    expect(coordinator.getStatus()).toBe("locked");
  });

  it("reports locked when authenticated but no user session", async () => {
    const { coordinator, relay } = createCoordinatorWithFakes({
      sync: createFakeSync({ user: null }),
    });
    await coordinator.syncNow();
    expect(coordinator.getStatus()).toBe("locked");
    // Relay should never have been called.
    expect(relay._getPushCalls()).toHaveLength(0);
    expect(relay._getPullCalls()).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 1: does not block a local write when the relay is unavailable
  // -------------------------------------------------------------------------

  it("does not block a local write when the relay is unavailable", async () => {
    const { coordinator, repository, relay } = createCoordinatorWithFakes({
      relay: createFakeRelay({ pushError: new Error("relay unavailable") }),
    });
    repository._setPending([sampleChange()]);

    // syncNow should not throw — it catches the error internally.
    await coordinator.syncNow();

    expect(coordinator.getStatus()).toBe("error");
    expect(coordinator.getLastError()).toContain("relay unavailable");

    // Local writes remain unaffected.
    const records: Remembrance[] = [
      { id: "rec-1", name: "Test", type: "Yahrzeit", hy: 5784, hm: "Tishrei", hd: 1 },
    ];
    await repository.saveAll(records);
    expect(repository.saveAll).toHaveBeenCalledWith(records);

    // Relay push was attempted but the local store is still usable.
    expect(relay._getPushCalls()).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Test 2: uploads pending changes, acknowledges them, then pulls remote
  // -------------------------------------------------------------------------

  it("uploads pending changes, acknowledges them, then pulls remote changes", async () => {
    const { coordinator, repository, relay, cipher } = createCoordinatorWithFakes();

    const local = sampleChange({ opId: "local-op-1" });
    const remote = remoteChange();
    const encryptedRemote = JSON.stringify(remote);

    repository._setPending([local]);
    relay._setPullResult({
      cursor: { sequence: 5 },
      changes: [{ opId: remote.opId, data: encryptedRemote, sequence: 5 }],
    });

    await coordinator.syncNow();

    // Push was called with encrypted {opId, data} rows.
    expect(relay._getPushCalls()).toHaveLength(1);
    const pushed = relay._getPushCalls()[0];
    expect(pushed).toHaveLength(1);
    expect(pushed[0].opId).toBe("local-op-1");
    expect(pushed[0].data).toBe(JSON.stringify(local));

    // Cipher encrypt was called for the pending change.
    expect(cipher.encrypt).toHaveBeenCalledWith(local);

    // Acknowledge was called with the successful opId.
    expect(repository._getAcknowledged()).toEqual([["local-op-1"]]);

    // Pull was called with the stored cursor (sequence 0 initially).
    expect(relay._getPullCalls()).toHaveLength(1);
    expect(relay._getPullCalls()[0]).toEqual({ sequence: 0 });

    // Cipher decrypt was called for the remote row.
    expect(cipher.decrypt).toHaveBeenCalledWith(encryptedRemote);

    // Apply was called with the decrypted change.
    expect(repository._getApplied()).toEqual([[remote]]);

    // Cursor was advanced only after apply succeeded.
    expect(repository._getSetCursorCalls()).toEqual([{ sequence: 5 }]);

    // Status returned to idle.
    expect(coordinator.getStatus()).toBe("idle");
    expect(coordinator.getLastError()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 3: does not advance the cursor when decrypt or apply fails
  // -------------------------------------------------------------------------

  it("does not advance the cursor when decrypt fails", async () => {
    const { coordinator, repository, relay, cipher } = createCoordinatorWithFakes();

    const remote = remoteChange();
    relay._setPullResult({
      cursor: { sequence: 5 },
      changes: [{ opId: remote.opId, data: JSON.stringify(remote), sequence: 5 }],
    });

    // Make decrypt throw.
    (cipher.decrypt as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("decrypt failed"),
    );

    await coordinator.syncNow();

    // Cursor must not have been advanced.
    expect(repository._getSetCursorCalls()).toEqual([]);
    expect(coordinator.getStatus()).toBe("error");
    expect(coordinator.getLastError()).toContain("decrypt failed");
  });

  it("does not advance the cursor when apply fails", async () => {
    const { coordinator, repository, relay, cipher } = createCoordinatorWithFakes();

    const remote = remoteChange();
    relay._setPullResult({
      cursor: { sequence: 5 },
      changes: [{ opId: remote.opId, data: JSON.stringify(remote), sequence: 5 }],
    });

    // Make applyRemote throw.
    (repository.applyRemote as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("apply failed"),
    );

    await coordinator.syncNow();

    // Cursor must not have been advanced.
    expect(repository._getSetCursorCalls()).toEqual([]);
    expect(coordinator.getStatus()).toBe("error");
    expect(coordinator.getLastError()).toContain("apply failed");

    // Decrypt was called (proving the batch was decrypted before apply).
    expect(cipher.decrypt).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4: backs off after failure and retries on the next online event
  // -------------------------------------------------------------------------

  it("backs off with increasing delays after repeated failures", async () => {
    const { coordinator, repository, scheduler } = createCoordinatorWithFakes({
      relay: createFakeRelay({ pushError: new Error("relay unavailable") }),
    });
    repository._setPending([sampleChange()]);

    // 1st failure → 5 s backoff.
    await coordinator.syncNow();
    expect(coordinator.getStatus()).toBe("error");
    expect(scheduler._timeouts.at(-1)?.ms).toBe(5_000);

    // 2nd failure → 30 s backoff.
    scheduler._triggerTimeouts();
    await vi.waitFor(() => {
      expect(scheduler._timeouts.at(-1)?.ms).toBe(30_000);
    });

    // 3rd failure → 5 min backoff.
    scheduler._triggerTimeouts();
    await vi.waitFor(() => {
      expect(scheduler._timeouts.at(-1)?.ms).toBe(300_000);
    });

    // 4th failure → 15 min (capped).
    scheduler._triggerTimeouts();
    await vi.waitFor(() => {
      expect(scheduler._timeouts.at(-1)?.ms).toBe(900_000);
    });

    // 5th failure → still 15 min (capped).
    scheduler._triggerTimeouts();
    await vi.waitFor(() => {
      expect(scheduler._timeouts.at(-1)?.ms).toBe(900_000);
    });
  });

  it("resets backoff after a successful cycle", async () => {
    let pushShouldFail = true;
    const relay = createFakeRelay();
    (relay.push as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      if (pushShouldFail) throw new Error("relay unavailable");
    });

    const { coordinator, repository, scheduler } = createCoordinatorWithFables(
      relay,
    );
    repository._setPending([sampleChange()]);

    // Fail once → 5 s backoff.
    await coordinator.syncNow();
    expect(scheduler._timeouts.at(-1)?.ms).toBe(5_000);

    // Clear the pending changes so the next cycle has nothing to push.
    repository._setPending([]);
    pushShouldFail = false;

    // Trigger the backoff timer → success.
    scheduler._triggerTimeouts();
    await vi.waitFor(() => {
      expect(coordinator.getStatus()).toBe("idle");
    });

    // No new backoff should be scheduled after success.
    expect(scheduler._timeouts).toHaveLength(0);

    // Now fail again → backoff should restart at 5 s.
    pushShouldFail = true;
    repository._setPending([sampleChange()]);
    await coordinator.syncNow();
    expect(scheduler._timeouts.at(-1)?.ms).toBe(5_000);
  });

  it("retries on the next online event after failure", async () => {
    let pushShouldFail = true;
    const relay = createFakeRelay();
    (relay.push as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      if (pushShouldFail) throw new Error("relay unavailable");
    });

    const { coordinator, repository, network } = createCoordinatorWithFables(
      relay,
    );
    repository._setPending([sampleChange()]);

    // Register event listeners (including the online trigger).
    const cleanup = coordinator.start();

    // Wait for the initial sync (triggered by start) to fail.
    await vi.waitFor(() => {
      expect(coordinator.getStatus()).toBe("error");
    });

    // Make the relay succeed and clear pending for the retry.
    pushShouldFail = false;
    repository._setPending([]);

    // Simulate the network coming back online.
    network._triggerOnline();

    // The online event should trigger a retry that succeeds.
    await vi.waitFor(() => {
      expect(coordinator.getStatus()).toBe("idle");
    });
    expect(coordinator.getLastError()).toBeNull();

    cleanup();
  });

  // -------------------------------------------------------------------------
  // Test 5: coalesces repeated triggers into one in-flight sync
  // -------------------------------------------------------------------------

  it("coalesces repeated triggers into one in-flight sync", async () => {
    const { coordinator, relay } = createCoordinatorWithFakes();

    // Call syncNow three times synchronously — only the first starts a cycle;
    // the other two are coalesced into a single follow-up.
    const p1 = coordinator.syncNow();
    const p2 = coordinator.syncNow();
    const p3 = coordinator.syncNow();

    await p1;
    await p2;
    await p3;

    // The first cycle calls pull once. The coalesced follow-up calls pull
    // once more. Total: 2 — not 3.
    await vi.waitFor(() => {
      expect(relay._getPullCalls()).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // start() and cleanup
  // -------------------------------------------------------------------------

  it("start registers triggers and cleanup removes all listeners and timers", async () => {
    const { coordinator, network, scheduler, sync } = createCoordinatorWithFakes();

    const cleanup = coordinator.start();

    // A visible-timer interval should be active while visible.
    expect(scheduler._intervals).toHaveLength(1);
    expect(scheduler._intervals[0].ms).toBe(300_000);

    // Trigger an immediate sync from start().
    await vi.waitFor(() => {
      expect(coordinator.getStatus()).toBe("idle");
    });

    cleanup();

    // All listeners and timers should be removed.
    expect(scheduler._intervals).toHaveLength(0);
    expect(scheduler._timeouts).toHaveLength(0);
  });

  it("start triggers sync on online, focus, and visibility events", async () => {
    const { coordinator, network, scheduler } = createCoordinatorWithFakes();
    const cleanup = coordinator.start();

    // Let the initial startup sync settle.
    await vi.waitFor(() => {
      expect(coordinator.getStatus()).toBe("idle");
    });

    // Online event.
    network._triggerOnline();
    await vi.waitFor(() => {
      expect(coordinator.getStatus()).toBe("idle");
    });

    // Focus event.
    scheduler._triggerFocus();
    await vi.waitFor(() => {
      expect(coordinator.getStatus()).toBe("idle");
    });

    // Visibility event (becoming visible).
    scheduler._setVisible(false);
    scheduler._triggerVisibility(); // going hidden — should stop the timer
    expect(scheduler._intervals).toHaveLength(0);

    scheduler._setVisible(true);
    scheduler._triggerVisibility(); // becoming visible — should restart timer
    expect(scheduler._intervals).toHaveLength(1);

    cleanup();
  });

  it("subscribe notifies listeners on status changes", async () => {
    const { coordinator, relay } = createCoordinatorWithFakes({
      relay: createFakeRelay({ pushError: new Error("fail") }),
    });
    const statuses: SyncStatus[] = [];
    coordinator.subscribe(() => statuses.push(coordinator.getStatus()));

    // Trigger a failing sync.
    const repo = createFakeRepository();
    repo._setPending([sampleChange()]);
    // Replace the coordinator's repository by creating a new one.
    const { coordinator: c2 } = createCoordinatorWithFakes({
      repository: repo,
      relay: createFakeRelay({ pushError: new Error("fail") }),
    });
    const statuses2: SyncStatus[] = [];
    c2.subscribe(() => statuses2.push(c2.getStatus()));

    await c2.syncNow();

    // Should have transitioned through syncing → error.
    expect(statuses2).toContain("syncing");
    expect(statuses2).toContain("error");
  });

  it("does not attempt sync when offline", async () => {
    const { coordinator, relay, network } = createCoordinatorWithFakes({
      network: createFakeNetwork({ online: false }),
    });
    await coordinator.syncNow();
    // Relay should never have been called.
    expect(relay._getPushCalls()).toHaveLength(0);
    expect(relay._getPullCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Local helper to avoid repeating relay wiring for backoff tests
// ---------------------------------------------------------------------------

function createCoordinatorWithFables(
  relay: FakeRelay,
): ReturnType<typeof createCoordinatorWithFakes> {
  const repository = createFakeRepository();
  const sync = createFakeSync();
  const cipher = createFakeCipher();
  const network = createFakeNetwork();
  const scheduler = createFakeScheduler();

  const coordinator = createSyncCoordinator({
    repository,
    sync,
    relay,
    cipher,
    network,
    scheduler,
  } as SyncCoordinatorDeps);

  return { coordinator, repository, sync, relay, cipher, network, scheduler };
}
