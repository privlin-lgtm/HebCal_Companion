# Local-First Encrypted Synchronisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make remembrance data local-first with IndexedDB persistence and opt-in automatic encrypted synchronisation through an intermittent Supabase relay, while preserving manual sync and JSON backup/import.

**Architecture:** IndexedDB is the local source of truth and records each local create, update, and delete in an outbox. A sync coordinator uploads encrypted, idempotent changes and pulls encrypted changes by cursor whenever the app starts, regains connectivity, returns to focus, or runs its throttled timer. Supabase stores opaque encrypted change rows and never becomes the UI’s authoritative store.

**Tech Stack:** React 19, TypeScript, Vite, IndexedDB, Supabase JS, Web Crypto AES-GCM/PBKDF2, Vitest, Playwright, Zod.

**Spec:** `C:\Users\privlin\.factory\specs\2026-09-04-local-first-encrypted-synchronisation.md`

## Global Constraints

- Local storage remains the primary user experience; sync failure never blocks local writes.
- Synchronisation is opt-in and intermittent; do not add a permanently connected WebSocket.
- Remembrance names and dates must be encrypted before leaving the device.
- The passphrase remains session-only and is never transmitted or persisted.
- Builds without Supabase configuration must continue to work accountlessly and offline.
- Deletes require durable tombstones until remote changes have been observed.
- All remote payloads must be validated after decryption before applying them.
- Existing `localStorage` remembrance data must migrate without overwriting newer local data.
- JSON export/import remains an explicit recovery and portability path.
- Keep the domain layer free of React, browser storage, Supabase, and fetch dependencies.

---

## File Map

- **Create:** `src/domain/sync.ts` — pure change, version, cursor, and conflict types/functions.
- **Modify:** `src/application/ports.ts` — asynchronous local repository and relay contracts.
- **Modify:** `src/application/remembranceService.ts` — await local persistence and expose sync-safe mutations.
- **Create:** `src/infrastructure/indexedDb.ts` — small IndexedDB open/transaction helpers and schema migration.
- **Create:** `src/infrastructure/indexedDbRemembranceRepository.ts` — records, outbox, tombstones, cursor, and localStorage migration.
- **Create:** `src/infrastructure/syncCoordinator.ts` — scheduling, retry state, push/pull orchestration, and status events.
- **Modify:** `src/infrastructure/supabaseSync.ts` — encrypted change batches, cursors, idempotent uploads, and remote row validation.
- **Modify:** `src/infrastructure/crypto.ts` — encrypt/decrypt typed change envelopes without exposing plaintext.
- **Modify:** `src/composition.ts` — construct IndexedDB repository and coordinator with dependency injection.
- **Modify:** `src/components/remembrances/Remembrances.tsx` — await repository-backed service operations.
- **Modify:** `src/components/sync/SyncPanel.tsx` — show automatic status and retain manual “Sync now”.
- **Modify:** `src/i18n/en.json`, `src/i18n/he.json` — status and failure copy.
- **Create:** `src/domain/sync.test.ts` — deterministic ordering and conflict tests.
- **Create:** `src/infrastructure/indexedDbRemembranceRepository.test.ts` — migration, outbox, tombstone, and cursor tests.
- **Create:** `src/infrastructure/syncCoordinator.test.ts` — retry, idempotency, offline, and scheduling tests.
- **Modify:** `src/infrastructure/supabaseSync.test.ts` — relay batch and validation tests.
- **Modify:** `src/application/remembranceService.test.ts` — async repository contract tests.
- **Create:** `docs/supabase-sync.sql` — append-only relay schema and RLS policies.
- **Modify:** `README.md`, `ARCHITECTURE.md` — updated local-first and setup documentation.
- **Modify:** `package.json`, `package-lock.json` — add the test-only IndexedDB implementation if needed by the repository tests.

## Data Contracts

The domain must use these pure types:

```ts
export type SyncVersion = { counter: number; deviceId: string };

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

export type SyncCursor = { sequence: number };
export type SyncEnvelope = { version: 1; changes: SyncChange[] };

export type EncryptedSyncChange = {
  opId: string;
  data: string;
};
```

`compareSyncVersion(a, b)` must order by `counter`, then `deviceId`; equal versions are no-ops. `shouldApplyChange(current, incoming)` must reject an incoming change whose version is not newer. These functions must not perform I/O.

The application ports must expose:

```ts
export type RemembranceRepository = {
  list(): Promise<Remembrance[]>;
  saveAll(records: Remembrance[]): Promise<Remembrance[]>;
  mergeUpcoming(updatesById: Map<string, Partial<Remembrance>>): Promise<Remembrance[]>;
  applyRemote(changes: SyncChange[]): Promise<void>;
  pendingChanges(): Promise<SyncChange[]>;
  acknowledgeChanges(opIds: string[]): Promise<void>;
  getCursor(): Promise<SyncCursor>;
  setCursor(cursor: SyncCursor): Promise<void>;
  getDeviceId(): Promise<string>;
};

export type SyncRelay = {
  isConfigured(): boolean;
  push(user: SyncUser, changes: EncryptedSyncChange[]): Promise<void>;
  pull(user: SyncUser, cursor: SyncCursor): Promise<{
    cursor: SyncCursor;
    changes: Array<EncryptedSyncChange & { sequence: number }>;
  }>;
};
```

## Task 1: Define Pure Sync Semantics

**Files:**
- Create: `src/domain/sync.ts`
- Create: `src/domain/sync.test.ts`
- Modify: `src/application/ports.ts`

- [ ] **Step 1: Write failing tests for version ordering and conflict application.**

```ts
it("orders versions by counter then device id", () => {
  expect(compareSyncVersion({ counter: 2, deviceId: "a" }, { counter: 1, deviceId: "z" })).toBeGreaterThan(0);
  expect(compareSyncVersion({ counter: 2, deviceId: "a" }, { counter: 2, deviceId: "b" })).toBeLessThan(0);
});

it("applies only a strictly newer change", () => {
  const current = { counter: 4, deviceId: "device-b" };
  expect(shouldApplyChange(current, { counter: 4, deviceId: "device-a" })).toBe(false);
  expect(shouldApplyChange(current, { counter: 5, deviceId: "device-a" })).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the domain module and contracts are absent.**

Run: `npm test -- src/domain/sync.test.ts`

Expected: FAIL with a module or exported-symbol error.

- [ ] **Step 3: Implement the pure contracts and comparison functions.**

Use `SyncVersion`, `SyncChange`, `SyncCursor`, and `SyncEnvelope` exactly as defined above. Export `compareSyncVersion` and `shouldApplyChange`. Do not import browser, React, Supabase, or crypto modules.

- [ ] **Step 4: Change `RemembranceRepository` to the async sync-aware port and add `SyncRelay` to `src/application/ports.ts`.**

- [ ] **Step 5: Run the domain and type tests.**

Run: `npm test -- src/domain/sync.test.ts && npm run typecheck`

Expected: sync domain tests PASS; unrelated application tests may fail until Task 2 updates their fake repository.

## Task 2: Implement IndexedDB Persistence and Migration

**Files:**
- Create: `src/infrastructure/indexedDb.ts`
- Create: `src/infrastructure/indexedDbRemembranceRepository.ts`
- Create: `src/infrastructure/indexedDbRemembranceRepository.test.ts`
- Modify: `src/application/remembranceService.test.ts`
- Modify: `src/infrastructure/remembranceRepository.ts`

- [ ] **Step 1: Add repository tests for first-run migration, local writes, deletes, and cursors.**

The tests must cover:

```ts
it("imports valid legacy localStorage records once and leaves the legacy key intact until success", async () => {});
it("creates one outbox upsert for a new remembrance", async () => {});
it("creates a delete tombstone when a saved record disappears", async () => {});
it("does not enqueue changes when applying a remote change", async () => {});
it("acknowledges only the requested operation ids", async () => {});
it("persists the pull cursor transactionally", async () => {});
```

Use a fresh isolated IndexedDB database per test. Add `fake-indexeddb` as a dev dependency only if the current Vitest environment lacks IndexedDB; do not add a runtime database library.

- [ ] **Step 2: Run the repository tests and verify the new async repository is not implemented.**

Run: `npm test -- src/infrastructure/indexedDbRemembranceRepository.test.ts`

Expected: FAIL with missing module or missing method errors.

- [ ] **Step 3: Implement `indexedDb.ts` with schema version 1.**

Create stores:

```text
records: keyPath id
changes: keyPath opId, index pending
metadata: keyPath key
```

Store active records plus `{ version, deleted }` metadata in `records`. Keep deleted rows as tombstones. Store the device ID, Lamport counter, migration marker, and pull cursor in `metadata`. Every transaction must reject on `error` and close the database on `versionchange`.

- [ ] **Step 4: Implement `createIndexedDbRemembranceRepository({ dbName, legacyStorage, ids, clock })`.**

`list()` returns active records sorted in insertion order. `saveAll()` validates with `assertWritableRemembrances`, diffs the prior active set, increments the local Lamport counter for each changed record, writes active records/tombstones, and appends outbox changes in one transaction. `applyRemote()` sorts changes by version, applies only newer changes, updates the Lamport counter to at least the incoming counter, and never appends to the outbox. `acknowledgeChanges()` deletes only acknowledged outbox entries. `pendingChanges()` returns stable order by counter, then device ID, then operation ID. `getCursor()` and `setCursor()` use the metadata store.

- [ ] **Step 5: Implement one-time legacy migration.**

On first open, parse `or-zarua-remembrances` using `sanitizeRemembrances`. If IndexedDB is empty and valid records exist, write them through the normal local mutation path so they receive outbox entries. Mark migration complete only after the transaction commits. Do not delete the old key; leaving it makes rollback and user recovery safe.

- [ ] **Step 6: Update `src/infrastructure/remembranceRepository.ts` only as a compatibility adapter for tests and callers that explicitly inject Web Storage.**

Make its methods satisfy the new async port and preserve validation behavior. Do not use this adapter in the production composition root.

- [ ] **Step 7: Update application fake repositories and run tests.**

Run: `npm test -- src/infrastructure/indexedDbRemembranceRepository.test.ts src/infrastructure/remembranceRepository.test.ts src/application/remembranceService.test.ts`

Expected: PASS.

## Task 3: Adapt the Application Service and UI to Async Local Writes

**Files:**
- Modify: `src/application/remembranceService.ts`
- Modify: `src/application/remembranceService.test.ts`
- Modify: `src/components/remembrances/Remembrances.tsx`

- [ ] **Step 1: Change service methods that read or write remembrance data to return promises.**

Use these signatures:

```ts
list(): Promise<Remembrance[]>;
remove(id: string): Promise<Remembrance[]>;
createFromGregorian(...): Promise<Remembrance>;
updateNotification(...): Promise<Remembrance[]>;
refreshUpcoming(...): Promise<Remembrance[]>;
exportBackup(): Promise<RemembranceExport>;
importBackup(payload: unknown): Promise<ReturnType<typeof mergeImported>>;
mergeRecords(incoming: Remembrance[]): Promise<ReturnType<typeof mergeImported>>;
```

- [ ] **Step 2: Update service tests with an async fake repository and await every operation.**

Add an assertion that `remove`, import, and upcoming-date refresh all persist through the repository before resolving.

- [ ] **Step 3: Run the service tests to verify the UI adapter is the remaining compile failure.**

Run: `npm test -- src/application/remembranceService.test.ts`

Expected: PASS after the fake is updated; component type errors are expected until Step 4.

- [ ] **Step 4: Update `Remembrances.tsx` so initial load, refresh, export, import, delete, save, and merge handlers await the service.**

Use an `alive` flag in the initial `useEffect` so an unmounted component does not call `setRecords`. Preserve the current two-phase refresh behavior after save/import, but make each `refresh()` asynchronous.

- [ ] **Step 5: Run typecheck and the existing component/E2E tests.**

Run: `npm run typecheck && npm test`

Expected: PASS.

## Task 4: Add Encrypted Relay Change Batches

**Files:**
- Modify: `src/infrastructure/crypto.ts`
- Modify: `src/infrastructure/supabaseSync.ts`
- Modify: `src/infrastructure/supabaseSync.test.ts`
- Create: `docs/supabase-sync.sql`

- [ ] **Step 1: Add relay tests using a mocked Supabase client.**

Cover:

```ts
it("pushes encrypted changes containing only pending operations", async () => {});
it("pulls encrypted rows after the requested cursor and returns the highest sequence", async () => {});
it("rejects malformed or oversized remote envelopes", async () => {});
it("treats duplicate operation ids as idempotent", async () => {});
```

Assert that the plaintext remembrance name does not appear in the row sent to Supabase.

- [ ] **Step 2: Run the focused relay tests and verify the new relay methods fail.**

Run: `npm test -- src/infrastructure/supabaseSync.test.ts`

Expected: FAIL with missing `push`/`pull` batch behavior.

- [ ] **Step 3: Add typed change helpers to `crypto.ts`.**

Implement `encryptSyncChange(change, passphrase): Promise<string>` and `decryptSyncChange(payload, passphrase): Promise<SyncChange>`. Validate change IDs, version fields, record schema, and operation kind after decryption. Reuse the existing versioned AES-GCM envelope and PBKDF2 parameters.

- [ ] **Step 4: Change `supabaseSync.ts` to expose `SyncRelay` behavior.**

Keep account/auth/unlock/lock behavior. `push(user, changes)` inserts `{ user_id, op_id, data }` rows with a unique `(user_id, op_id)`; `op_id` is only an opaque deduplication identifier and `data` contains the encrypted change. Configure duplicate inserts to be ignored. `pull(user, cursor)` selects ordered `sequence,op_id,data` rows after the cursor, caps one response at 100 rows, returns the maximum sequence, and returns an empty `changes` array when there is no data. Never log decrypted content.

- [ ] **Step 5: Add `docs/supabase-sync.sql`.**

Use an append-only table with server-generated sequence:

```sql
create table if not exists public.sync_changes (
  sequence bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  op_id text not null,
  data text not null,
  created_at timestamptz not null default now(),
  unique (user_id, op_id)
);

alter table public.sync_changes enable row level security;

create policy "Users manage own encrypted sync changes"
  on public.sync_changes for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists sync_changes_user_sequence
  on public.sync_changes(user_id, sequence);
```

Document that old `remembrances` rows remain readable for migration and may be removed only after a successful client migration.

- [ ] **Step 6: Run relay tests and typecheck.**

Run: `npm test -- src/infrastructure/supabaseSync.test.ts && npm run typecheck`

Expected: PASS.

## Task 5: Implement the Automatic Sync Coordinator

**Files:**
- Create: `src/infrastructure/syncCoordinator.ts`
- Create: `src/infrastructure/syncCoordinator.test.ts`
- Modify: `src/application/ports.ts`

- [ ] **Step 1: Write coordinator tests for status transitions and retry behavior.**

Cover:

```ts
it("does not block a local write when the relay is unavailable", async () => {});
it("uploads pending changes, acknowledges them, then pulls remote changes", async () => {});
it("does not advance the cursor when decrypt or apply fails", async () => {});
it("backs off after failure and retries on the next online event", async () => {});
it("coalesces repeated triggers into one in-flight sync", async () => {});
```

- [ ] **Step 2: Run the coordinator tests and verify they fail.**

Run: `npm test -- src/infrastructure/syncCoordinator.test.ts`

Expected: FAIL because the coordinator module is absent.

- [ ] **Step 3: Implement `createSyncCoordinator({ repository, sync, clock, network, scheduler })`.**

Expose:

```ts
type SyncStatus = "disabled" | "locked" | "idle" | "queued" | "syncing" | "error";
type SyncCoordinator = {
  start(): () => void;
  syncNow(): Promise<void>;
  getStatus(): SyncStatus;
  getLastError(): string | null;
  subscribe(listener: () => void): () => void;
};
```

When configured and authenticated/unlocked, `syncNow()` uploads batches of at most 100 pending changes, acknowledges only successful operation IDs, pulls from the stored cursor, decrypts and applies the complete batch transactionally, and advances the cursor only after apply succeeds. Use exponential delays of 5 seconds, 30 seconds, and 5 minutes, capped at 15 minutes. Reset the delay after a successful cycle. Local writes remain independent of coordinator errors.

- [ ] **Step 4: Wire scheduling in `start()`.**

Register `online`, `visibilitychange`, and `focus` listeners. Trigger immediately at startup and after unlock/auth changes. Use a 5-minute timer only while the document is visible. Clear every listener and timer from the returned cleanup function.

- [ ] **Step 5: Run coordinator tests.**

Run: `npm test -- src/infrastructure/syncCoordinator.test.ts`

Expected: PASS.

## Task 6: Wire Composition and Sync UI

**Files:**
- Modify: `src/composition.ts`
- Modify: `src/components/sync/SyncPanel.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/he.json`

- [ ] **Step 1: Add UI tests or extend existing component coverage for disabled, locked, syncing, error, and synced states.**

Assert that automatic status is visible, manual “Sync now” remains available, and error text does not expose the passphrase or decrypted payload.

- [ ] **Step 2: Replace production repository construction in `composition.ts`.**

Construct the IndexedDB repository with the existing ID generator and clock, create Supabase sync, create the coordinator, and start it from the composition root. Add `syncCoordinator` to `AppServices`. Keep `SyncPort` auth controls available to the panel.

- [ ] **Step 3: Update `SyncPanel.tsx`.**

Subscribe to coordinator status. Keep sign-in, unlock, lock, and sign-out flows. Replace separate upload/download as the primary controls with `Sync now`, while retaining a secondary explicit download/recovery action if the current UX needs it. Never claim “synced” until both upload and pull complete.

- [ ] **Step 4: Add English and Hebrew translations for `sync.status.*`, `sync.syncNow`, `sync.retry`, and errors for offline, locked, corrupt data, authentication, and quota conditions.**

- [ ] **Step 5: Run typecheck and all unit tests.**

Run: `npm run typecheck && npm test`

Expected: PASS.

## Task 7: Add End-to-End and Documentation Coverage

**Files:**
- Modify: `e2e/*.spec.ts`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Add an E2E scenario for local-first operation.**

Launch with Supabase unset, create a remembrance while the page is offline, reload, and assert that the record remains available. Use Playwright’s context route/offline controls; do not call a real external account.

- [ ] **Step 2: Add a deterministic two-context sync scenario with a fake relay.**

Use a test-only in-memory relay injected through the app’s composition seam. Create a record in context A, trigger sync, open context B with the same account/passphrase, trigger sync, and assert that the name appears. Delete it in A, sync, then sync B and assert the tombstone prevents resurrection.

- [ ] **Step 3: Update README setup instructions.**

Document IndexedDB as the local store, automatic sync triggers, the optional relay schema from `docs/supabase-sync.sql`, manual “Sync now”, export/import recovery, and the fact that data remains unusable if the passphrase is lost.

- [ ] **Step 4: Update ARCHITECTURE.md.**

Replace the one-row last-write-wins description with the local records/outbox/inbox/cursor model. Record why peer-to-peer-only sync was rejected, explain tombstones and deterministic conflict ordering, and state that the relay connection is intermittent rather than permanent.

- [ ] **Step 5: Run the full validation suite.**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`

Expected: all commands PASS. If the browser install is missing, run `npx playwright install chromium` before the E2E command.

## Task 8: Final Review and Safe Migration Check

**Files:**
- Review all files listed above

- [ ] **Step 1: Search for synchronous production calls that now require `await`.**

Run: `rg -n "remembranceService\\.(list|remove|createFromGregorian|updateNotification|refreshUpcoming|exportBackup|importBackup|mergeRecords)\\(" src`

Every production call must either await the promise or intentionally handle it in an async effect/handler.

- [ ] **Step 2: Search for plaintext sync logging and stale one-blob assumptions.**

Run: `rg -n "console\\.(log|warn|error)|last-write|updated_at|public\\.remembrances|localStorage.*remembrance" src docs README.md ARCHITECTURE.md`

Remove any new plaintext payload logging and update stale documentation; retain only the migration key and compatibility schema references.

- [ ] **Step 3: Run the final suite again and inspect the diff.**

Run: `git diff --check; npm run typecheck; npm run lint; npm test; npm run build`

Expected: no whitespace errors, type errors, lint errors, test failures, or build failures.
