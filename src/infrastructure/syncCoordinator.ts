/**
 * Automatic sync coordinator — orchestrates encrypted push/pull between the
 * local repository and the relay without ever blocking local writes.
 *
 * The coordinator is the glue between four injected collaborators:
 *
 * - {@link RemembranceRepository} — the local source of truth (pending outbox,
 *   cursor, apply-remote).
 * - {@link SyncPort} — configuration, unlock state, current user, and auth
 *   change events.
 * - {@link SyncRelay} — opaque encrypted row push/pull.
 * - {@link SyncCrypto} — per-change encryption/decryption using the session
 *   passphrase.
 *
 * Design rules enforced by this module:
 *
 * - **Disabled when unconfigured.** If `sync.isConfigured()` is false the
 *   coordinator reports `"disabled"` and never attempts I/O.
 * - **Locked until authenticated and unlocked.** If `sync.isUnlocked()` is
 *   false or the user is not signed in, the coordinator reports `"locked"`.
 * - **Never blocks local writes.** `syncNow()` catches every relay/crypto
 *   error and converts it to `"error"` status.  The repository remains
 *   writable at all times.
 * - **Encrypt before push.** Each pending change is encrypted via the cipher
 *   port; only `{ opId, data }` rows reach the relay.
 * - **Acknowledge only successful opIds.** After a batch push succeeds the
 *   coordinator acknowledges those opIds so the outbox can drop them.
 * - **Cursor advances only after apply succeeds.** If decrypt or apply
 *   throws, the cursor is left untouched so the next cycle retries the same
 *   rows.
 * - **Coalescing.** Repeated triggers while a sync is in-flight are collapsed
 *   into a single follow-up cycle.
 * - **Exponential backoff.** Retry delays are 5 s, 30 s, 5 min, capped at
 *   15 min.  The delay resets to 5 s after a successful cycle.
 * - **Intermittent scheduling.** `start()` registers `online`,
 *   `visibilitychange`, `focus`, and auth-change triggers, uses a 5-minute
 *   interval timer only while the document is visible, and returns a cleanup
 *   function that removes every listener and timer.
 */

import type {
  Clock,
  NetworkPort,
  RemembranceRepository,
  SchedulerPort,
  SyncCoordinator,
  SyncCrypto,
  SyncPort,
  SyncRelay,
  SyncStatus,
  SyncUser,
} from "../application/ports";
import type { EncryptedSyncChange, SyncChange } from "../domain/sync";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Exponential retry delays: 5 s, 30 s, 5 min. */
const BACKOFF_DELAYS = [5_000, 30_000, 300_000] as const;
/** Maximum retry delay: 15 min. */
const MAX_BACKOFF = 900_000;
/** Interval for the visible-only periodic timer: 5 min. */
const VISIBLE_TIMER_INTERVAL = 300_000;
/** Maximum changes per push/pull batch. */
const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Public dependency type
// ---------------------------------------------------------------------------

export type SyncCoordinatorDeps = {
  repository: RemembranceRepository;
  sync: SyncPort;
  relay: SyncRelay;
  /** Per-change encryption/decryption using the session passphrase. */
  cipher: SyncCrypto;
  /** Unused by the coordinator but accepted for composition compatibility. */
  clock?: Clock;
  /** Defaults to `navigator.onLine` / `window` "online" event. */
  network?: NetworkPort;
  /** Defaults to `setTimeout` / `setInterval` / `document` / `window`. */
  scheduler?: SchedulerPort;
};

// ---------------------------------------------------------------------------
// Default environment adapters (used when no override is injected)
// ---------------------------------------------------------------------------

function createDefaultNetwork(): NetworkPort {
  return {
    isOnline: () =>
      typeof navigator !== "undefined" ? navigator.onLine : true,
    onOnline: (listener) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("online", listener);
      return () => window.removeEventListener("online", listener);
    },
  };
}

function createDefaultScheduler(): SchedulerPort {
  return {
    setTimeout: (handler, ms) => {
      const id = globalThis.setTimeout(handler, ms);
      return () => globalThis.clearTimeout(id);
    },
    setInterval: (handler, ms) => {
      const id = globalThis.setInterval(handler, ms);
      return () => globalThis.clearInterval(id);
    },
    isVisible: () => {
      if (typeof document === "undefined") return true;
      return document.visibilityState === "visible";
    },
    onVisibilityChange: (listener) => {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
    onFocus: (listener) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("focus", listener);
      return () => window.removeEventListener("focus", listener);
    },
  };
}

// ---------------------------------------------------------------------------
// Coordinator factory
// ---------------------------------------------------------------------------

export function createSyncCoordinator(deps: SyncCoordinatorDeps): SyncCoordinator {
  const { repository, sync, relay, cipher } = deps;
  const network = deps.network ?? createDefaultNetwork();
  const scheduler = deps.scheduler ?? createDefaultScheduler();

  let status: SyncStatus = sync.isConfigured()
    ? sync.isUnlocked()
      ? "idle"
      : "locked"
    : "disabled";
  let lastError: string | null = null;
  let inFlight = false;
  let pendingTrigger = false;
  let backoffIndex = 0;
  let backoffCleanup: (() => void) | null = null;
  let visibleTimerCleanup: (() => void) | null = null;
  const listeners = new Set<() => void>();

  // --- helpers ---------------------------------------------------------------

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function setStatus(next: SyncStatus): void {
    status = next;
    notify();
  }

  function getBackoffDelay(): number {
    return backoffIndex < BACKOFF_DELAYS.length
      ? BACKOFF_DELAYS[backoffIndex]
      : MAX_BACKOFF;
  }

  function scheduleRetry(): void {
    const delay = getBackoffDelay();
    backoffIndex += 1;
    backoffCleanup?.();
    backoffCleanup = scheduler.setTimeout(() => {
      backoffCleanup = null;
      void syncNow();
    }, delay);
  }

  function resetBackoff(): void {
    backoffIndex = 0;
    backoffCleanup?.();
    backoffCleanup = null;
  }

  // --- core sync cycle --------------------------------------------------------

  /**
   * Uploads pending changes (encrypt → push → acknowledge), then pulls
   * remote changes (pull → decrypt → apply → advance cursor) in batches of
   * at most {@link BATCH_SIZE}.
   *
   * The cursor is advanced **only** after `applyRemote` succeeds, so a
   * decrypt or apply failure leaves the cursor untouched for the next retry.
   */
  async function runSyncCycle(user: SyncUser): Promise<void> {
    // --- Upload pending changes ---
    const pending = await repository.pendingChanges();
    if (pending.length > 0) {
      const ackedOpIds: string[] = [];
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        const encrypted: EncryptedSyncChange[] = [];
        for (const change of batch) {
          const data = await cipher.encrypt(change);
          encrypted.push({ opId: change.opId, data });
        }
        await relay.push(user, encrypted);
        for (const change of batch) ackedOpIds.push(change.opId);
      }
      if (ackedOpIds.length > 0) {
        await repository.acknowledgeChanges(ackedOpIds);
      }
    }

    // --- Pull and apply remote changes ---
    let hasMore = true;
    while (hasMore) {
      const cursor = await repository.getCursor();
      const result = await relay.pull(user, cursor);
      if (result.changes.length === 0) break;

      // Decrypt all rows in the batch before applying.
      const decrypted: SyncChange[] = [];
      for (const row of result.changes) {
        decrypted.push(await cipher.decrypt(row.data));
      }

      // Apply the full batch transactionally.
      await repository.applyRemote(decrypted);

      // Advance the cursor only after apply succeeds.
      await repository.setCursor(result.cursor);

      // If the relay returned a full batch there may be more rows.
      hasMore = result.changes.length >= BATCH_SIZE;
    }
  }

  // --- public API ------------------------------------------------------------

  async function syncNow(): Promise<void> {
    if (!sync.isConfigured()) {
      setStatus("disabled");
      return;
    }
    if (!sync.isUnlocked()) {
      setStatus("locked");
      return;
    }
    if (!network.isOnline()) return;

    // Coalesce repeated triggers into one in-flight sync.
    if (inFlight) {
      pendingTrigger = true;
      return;
    }

    inFlight = true;
    setStatus("syncing");

    try {
      const user = await sync.getUser();
      if (!user) {
        // Not authenticated — don't retry, just report locked.
        setStatus("locked");
        return;
      }
      await runSyncCycle(user);
      resetBackoff();
      lastError = null;
      setStatus("idle");
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      setStatus("error");
      scheduleRetry();
    } finally {
      inFlight = false;
      if (pendingTrigger) {
        pendingTrigger = false;
        void syncNow();
      }
    }
  }

  function getStatus(): SyncStatus {
    return status;
  }

  function getLastError(): string | null {
    return lastError;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function startVisibleTimer(): void {
    if (visibleTimerCleanup) return;
    visibleTimerCleanup = scheduler.setInterval(() => {
      void syncNow();
    }, VISIBLE_TIMER_INTERVAL);
  }

  function stopVisibleTimer(): void {
    visibleTimerCleanup?.();
    visibleTimerCleanup = null;
  }

  function start(): () => void {
    const cleanups: (() => void)[] = [];

    // Trigger when the network comes back online.
    cleanups.push(network.onOnline(() => { void syncNow(); }));

    // Trigger on visibility change; manage the visible-only timer.
    cleanups.push(
      scheduler.onVisibilityChange(() => {
        if (scheduler.isVisible()) {
          startVisibleTimer();
          void syncNow();
        } else {
          stopVisibleTimer();
        }
      }),
    );

    // Trigger when the window regains focus.
    cleanups.push(scheduler.onFocus(() => { void syncNow(); }));

    // Trigger after auth changes (sign-in), if unlocked.
    cleanups.push(
      sync.onAuthChange((user) => {
        if (user && sync.isUnlocked()) void syncNow();
      }),
    );

    // Start the visible-only timer if the document is already visible.
    if (scheduler.isVisible()) startVisibleTimer();

    // Trigger immediately at startup.
    void syncNow();

    return () => {
      for (const cleanup of cleanups) cleanup();
      stopVisibleTimer();
      backoffCleanup?.();
      backoffCleanup = null;
    };
  }

  return { start, syncNow, getStatus, getLastError, subscribe };
}
