/** Pure synchronization versions, changes, and conflict semantics. */

import type { Remembrance } from "./remembrance";

export type SyncVersion = {
  counter: number;
  deviceId: string;
};

export type SyncChange =
  | {
      opId: string;
      recordId: string;
      deviceId: string;
      version: SyncVersion;
      kind: "upsert";
      record: Remembrance;
    }
  | {
      opId: string;
      recordId: string;
      deviceId: string;
      version: SyncVersion;
      kind: "delete";
    };

export type SyncCursor = {
  sequence: number;
};

export type SyncEnvelope = {
  version: 1;
  changes: SyncChange[];
};

export type EncryptedSyncChange = {
  opId: string;
  data: string;
};

/**
 * Compares Lamport-style versions by counter, then by device id.
 *
 * Device ids are compared directly rather than with locale-sensitive
 * collation so the ordering is stable across runtimes.
 */
export function compareSyncVersion(a: SyncVersion, b: SyncVersion): number {
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.deviceId === b.deviceId) return 0;
  return a.deviceId < b.deviceId ? -1 : 1;
}

/** Returns true only when the incoming version is strictly newer. */
export function shouldApplyChange(
  current: SyncVersion | null | undefined,
  incoming: SyncVersion,
): boolean {
  return current == null || compareSyncVersion(current, incoming) < 0;
}
