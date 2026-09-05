/**
 * E2E-only fake sync infrastructure.
 *
 * The two-context sync scenario must not touch a real Supabase account, so
 * this module provides:
 *
 * 1. `createE2eRelay()` — a deterministic in-memory relay living in the
 *    Playwright (Node) process. Both Playwright contexts bridge to the SAME
 *    store through `page.exposeFunction`, which is what makes a two-context
 *    sync scenario possible: each page believes it talks to a remote relay,
 *    but every push/pull round-trips into this shared Node-side store.
 *    Encryption/decryption uses the real `crypto.ts` implementation so the
 *    E2E exercises genuine AES-GCM envelopes and passphrase handling.
 *
 * 2. `installFakeSyncHook()` — a fully self-contained init-script factory
 *    (no captured Node values — Playwright serialises only this function)
 *    that installs the fake `SupabaseSync` adapter on
 *    `window.__OR_ZARUA_E2E_TEST_SYNC__`. `composition.ts` consults that
 *    global when it was built with `VITE_E2E_TEST_HOOK=1`.
 */

import { encryptSyncChange, decryptSyncChange } from "../src/infrastructure/crypto";
import type { EncryptedSyncChange, SyncChange, SyncCursor, SyncUser } from "../src/application/ports";

/** Bridge function names installed on each page by `prepareFakeSyncPage`. */
export const RELAY_ENCRYPT_BRIDGE = "__orZaruaTestEncrypt";
export const RELAY_DECRYPT_BRIDGE = "__orZaruaTestDecrypt";
export const RELAY_PUSH_BRIDGE = "__orZaruaTestRelayPush";
export const RELAY_PULL_BRIDGE = "__orZaruaTestRelayPull";

export type E2eRelayRow = {
  sequence: number;
  userId: string;
  opId: string;
  data: string;
};

export type E2eRelay = ReturnType<typeof createE2eRelay>;

/**
 * In-memory append-only relay mirroring the Supabase `sync_changes` semantics:
 * server-assigned increasing sequence numbers, idempotent de-duplication on
 * `(userId, opId)`, and cursor-based pulls that return at most 100 rows with
 * the highest observed sequence as the next cursor.
 */
export function createE2eRelay() {
  const rows = new Map<string, E2eRelayRow>();
  let nextSequence = 0;

  return {
    push: async (user: SyncUser, changes: EncryptedSyncChange[]): Promise<void> => {
      for (const change of changes) {
        const key = `${user.id}:${change.opId}`;
        if (rows.has(key)) continue; // idempotent — duplicate uploads are ignored
        nextSequence += 1;
        rows.set(key, {
          sequence: nextSequence,
          userId: user.id,
          opId: change.opId,
          data: change.data,
        });
      }
    },
    pull: async (
      user: SyncUser,
      cursor: SyncCursor,
    ): Promise<{ cursor: SyncCursor; changes: Array<EncryptedSyncChange & { sequence: number }> }> => {
      const mine = [...rows.values()]
        .filter((row) => row.userId === user.id && row.sequence > cursor.sequence)
        .sort((a, b) => a.sequence - b.sequence)
        .slice(0, 100);
      return {
        cursor: { sequence: mine.length ? mine[mine.length - 1].sequence : cursor.sequence },
        changes: mine.map((row) => ({ opId: row.opId, data: row.data, sequence: row.sequence })),
      };
    },
    /** Real AES-GCM encryption via the production crypto module. */
    encrypt: (change: SyncChange, passphrase: string): Promise<string> =>
      encryptSyncChange(change, passphrase),
    /** Real decryption and post-decryption schema validation. */
    decrypt: (payload: string, passphrase: string): Promise<SyncChange> =>
      decryptSyncChange(payload, passphrase),
    rowCount: (): number => rows.size,
    allRows: (): E2eRelayRow[] => [...rows.values()],
  };
}

/**
 * Self-contained factory installed via `page.addInitScript`.
 *
 * Must reference nothing but `globalThis` and string literals: Playwright
 * serialises this exact function into each page before the app boots, then
 * the app's composition seam (`createSyncAdapter` in `src/composition.ts`)
 * reads `window.__OR_ZARUA_E2E_TEST_SYNC__` and builds its sync adapter from
 * it when the build was made with `VITE_E2E_TEST_HOOK=1`.
 */
export function installFakeSyncHook(): void {
  const HOOK_GLOBAL = "__OR_ZARUA_E2E_TEST_SYNC__";
  const ENCRYPT = "__orZaruaTestEncrypt";
  const DECRYPT = "__orZaruaTestDecrypt";
  const PUSH = "__orZaruaTestRelayPush";
  const PULL = "__orZaruaTestRelayPull";

  const g = globalThis as Record<string, unknown>;

  g[HOOK_GLOBAL] = {
    createSync: () => {
      let user: { id: string; email: string } | null = null;
      let passphrase = "";
      const authListeners: Array<(next: unknown) => void> = [];

      const bridge = (name: string) => {
        const fn = g[name] as ((...args: unknown[]) => Promise<unknown>) | undefined;
        if (typeof fn !== "function") {
          throw new Error(`E2E relay bridge "${name}" is missing — call page.exposeFunction first.`);
        }
        return fn;
      };

      return {
        isConfigured: () => true,
        isUnlocked: () => passphrase.length > 0,
        signIn: async (email: string) => {
          user = { id: "e2e-user", email };
          for (const listener of authListeners) listener(user);
          return user;
        },
        signUp: async (email: string) => ({
          user: { id: "e2e-user", email },
          needsConfirmation: false,
        }),
        signOut: async () => {
          user = null;
          passphrase = "";
          for (const listener of authListeners) listener(null);
        },
        getUser: async () => user,
        onAuthChange: (listener: (next: unknown) => void) => {
          authListeners.push(listener);
          return () => {
            const index = authListeners.indexOf(listener);
            if (index >= 0) authListeners.splice(index, 1);
          };
        },
        unlock: (value: string) => {
          const trimmed = value.trim();
          if (trimmed.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
          passphrase = trimmed;
        },
        lock: () => {
          passphrase = "";
        },
        // Legacy whole-blob port methods are unused by the coordinator; keep
        // them harmless so the SyncPanel can still mount.
        push: async () => {},
        pull: async () => null,
        getLastSync: () => null,
        crypto: {
          encrypt: (change: unknown) => bridge(ENCRYPT)(change, passphrase),
          decrypt: (payload: string) => bridge(DECRYPT)(payload, passphrase),
        },
        relay: {
          isConfigured: () => true,
          push: (u: unknown, changes: unknown) => bridge(PUSH)(u, changes),
          pull: (u: unknown, cursor: unknown) => bridge(PULL)(u, cursor),
        },
        pushChanges: (u: unknown, changes: unknown) => bridge(PUSH)(u, changes),
        pullChanges: (u: unknown, cursor: unknown) => bridge(PULL)(u, cursor),
      };
    },
  };
}
