# Architecture

Or Zarua (Hebrew Calendar Companion) is a local-first web application built with React 19, TypeScript, and Tailwind CSS v4. Calendar math runs locally via `@hebcal/core` for offline-first operation. An optional Supabase relay provides encrypted cross-device sync on top of an IndexedDB local store. Capacitor enables native iOS/Android deployment from the same codebase.

## Goals

1. Convert Gregorian ↔ Hebrew dates, including after-sunset behavior — **offline-first** via `@hebcal/core`.
2. Show upcoming Shabbat candle-lighting and Havdalah for any location, with degraded cache when offline.
3. Store yahrzeits, anniversaries, Bar/Bat Mitzvahs, Hebrew birthdays, and fast days privately on-device.
4. Compute next secular observance date for each remembrance.
5. Provide daily zmanim (halachic times) for the selected location.
6. Display a Hebrew calendar month view with parashat, holidays, and learning schedule.
7. Support English and Hebrew with full RTL layout.
8. Work across phone, tablet, laptop, and smart display (kiosk mode).
9. Optionally sync encrypted remembrances across devices via a Supabase relay.
10. Remain deployable as a static site (GitHub Pages) with no required backend.

## Layering

```
main.tsx
  └─ App.tsx              Root React component
       └─ composition.ts  Composition root (DI wiring)
            ├─ application/  Use cases (ports in, DTOs out)
            ├─ domain/      Pure rules (no React, no fetch, no DOM, no storage)
            ├─ infrastructure/  Adapters (Hebcal, Open-Meteo, localStorage, Supabase, Capacitor)
            └─ components/   React UI (injected via AppContext)
```

Dependency rule: **domain ← application ← infrastructure/components**. Outer layers may depend inward; domain never depends outward.

## Why this shape (decision log)

| Decision | Choice | Why |
|---|---|---|
| Framework | React 19 | Largest ecosystem, first-class Supabase support, best for complex state (calendar grid, multi-location, sync, auth), strongest portfolio signal |
| Architecture | Clean Architecture lite | Keeps calendar math and storage rules unit-testable; adapters are replaceable; domain is framework-agnostic |
| Language | TypeScript (all layers) | Full type safety across domain, application, infrastructure, and UI; no JS/TS split |
| Calendar math | `@hebcal/core` (local, primary) | Offline-first; no network needed for date conversion, holidays, zmanim, or candle-lighting; eliminates API dependency for core features |
| API fallback | Hebcal REST API (secondary) | Used for Shabbat times when local calculation isn't sufficient; wrapped with durable cache for degraded mode |
| Styling | Tailwind CSS v4 | Logical properties (`ps-`, `pe-`, `ms-`, `me-`) make RTL trivial; `dark:` variant for dark mode; fast iteration without a component library |
| i18n | i18next + react-i18next | Industry standard; interpolation, plurals, lazy loading; React integration via hooks |
| Hosting | GitHub Pages static build | Matches "no required backend"; CI deploys `dist/` |
| Privacy default | IndexedDB local store + export/import | Memorial data should not require an account; IndexedDB persists across reloads and keeps the app usable offline |
| Sync (optional) | Supabase relay with client-side encryption | Cross-device persistence via an intermittent, append-only encrypted change log; per-change AES-GCM encryption before upload; server never holds the passphrase, plaintext, or a full snapshot |
| Offline | `@hebcal/core` + durable response cache | Local calendar math works fully offline; Shabbat API responses cached for degraded mode |
| PWA | vite-plugin-pwa (Workbox) | Service worker generation, install prompt, runtime caching for API responses |
| Native shell | Capacitor 6 | Same React codebase → iOS/Android apps; local notifications for reminders; minimal code changes |
| Validation | zod | Runtime schema validation for API responses, imports, and sync payloads |
| Dates | date-fns | Tree-shakeable date utilities; complements `@hebcal/core` for Gregorian date manipulation |
| Testing | Vitest (unit) + Playwright (E2E) | Vitest with jsdom for component tests; Playwright against production build |

## Ports

Defined in `src/application/ports.ts`:

- `CalendarPort` — convert dates, fetch Shabbat, get zmanim, get learning, local conversion
- `GeocoderPort` — city/country → coordinates + timezone
- `RemembranceRepository` — IndexedDB-backed records, outbox, tombstones, and pull cursor (`list`, `saveAll`, `mergeUpcoming`, `applyRemote`, `pendingChanges`, `acknowledgeChanges`, `getCursor`/`setCursor`, `getDeviceId`)
- `LocationStore` — last Shabbat location preference
- `MultiLocationStore` — saved locations (home, travel, community)
- `SyncPort` — Supabase auth (sign-in/sign-up/sign-out, auth-change events) plus passphrase unlock/lock and session state
- `SyncRelay` — opaque encrypted row push/pull by cursor (`push`, `pull`; configured state)
- `SyncCrypto` — per-change AES-GCM encrypt/decrypt with the session passphrase
- `SyncCoordinator` — schedules intermittent sync cycles, exposes `SyncStatus`/last error, coalesces triggers, applies backoff
- `NotificationPort` — schedule/cancel reminders (Web + Capacitor)
- `Clock` / `IdGenerator` — injectable time and ids for tests
- `ThemeStore` — light/dark/system theme preference

## Threat model (remembrances)

| Asset | Risk | Mitigation |
|---|---|---|
| Remembrance names | Readable by anyone with device/browser access | On-device only by default; no sync without explicit account creation; export is explicit user action |
| Memorial dates | Sent to Hebcal during convert/refresh | Required for next-observance calculation; disclosed in docs; names are not sent |
| Synced data | Server could read remembrances | AES-GCM encryption before upload; server only stores ciphertext; key derived by PBKDF2-SHA256 (210,000 iterations) from a passphrase that is separate from the account password, held in memory for the session only, and never transmitted or persisted |
| Import files | Malicious JSON | Schema validation via zod; reject binary/non-JSON; cap at 500 rows |
| XSS | Injected HTML in names/events | React's built-in escaping; `textContent` for any direct DOM manipulation |
| Supply chain | Compromised deps | Lockfile + CI; minimal runtime deps; `@hebcal/core` is the only major runtime dependency for calendar math |
| API keys | Supabase publishable (anon) key in client | Public by design; the real boundary is a single `ALL` RLS policy scoped to `auth.uid() = user_id`; `service_role` and `sb_secret_` keys never enter the bundle |

**Non-goals:** server-side persistence of unencrypted data, end-to-end encryption of the Supabase transport layer (TLS handles transport; client-side encryption handles payload), multi-tenant admin access. Passphrase recovery is also a non-goal — losing it makes the ciphertext unrecoverable, which is the intended consequence of the server holding no key material.

## Sync design

Sync is opt-in and additive. With `VITE_SUPABASE_URL` unset, `SyncPort.isConfigured()` returns false and the UI hides sync entirely, so the app stays fully functional as a static, accountless site.

- **Auth** is Supabase email/password (GoTrue). Sessions persist and refresh automatically; `detectSessionInUrl` is disabled because the app is served from a static subpath.
- **Encryption** uses a versioned envelope, `{ v, kdf, iter, salt, iv, ct }`, serialized as JSON. A fresh 16-byte salt and 12-byte IV are generated per upload and travel with the ciphertext, so any device holding the passphrase can decrypt without the server storing key material, and KDF cost can be raised later without invalidating existing records.
- **Key derivation** is PBKDF2-SHA256 at 210,000 iterations producing a 256-bit AES-GCM key. The passphrase lives only in a closure variable for the session; `lock()` clears it.
- **Local store** is IndexedDB, never the relay. The `records` store holds active remembrances plus `{ version, deleted }` metadata, keeping deleted rows as durable tombstones; the `changes` store is the outbox of unacknowledged local edits; the `metadata` store holds the device id, Lamport counter, migration marker, and pull cursor. Local writes are fast and never block on the network.
- **Change model** is record-level, not one blob per user. Every local create, update, or delete appends a versioned `SyncChange` (`upsert` or `delete`) to the outbox; each change is encrypted into an opaque `{ opId, data }` row before leaving the device. The relay table `sync_changes` is append-only with a server-generated `sequence`, a `(user_id, op_id)` uniqueness constraint that makes duplicate uploads idempotent, row-level security scoping each user to their own rows, and a `(user_id, sequence)` index for cursor pulls.
- **Deterministic conflict ordering.** Versions are Lamport clocks `{ counter, deviceId }`. `compareSyncVersion` orders by counter, then by deviceId, so any two devices editing the same record converge on the same winner in every order of arrival; equal versions are no-ops. `shouldApplyChange` applies an incoming change only when its version is strictly newer, so replayed or stale rows never overwrite newer local state. `applyRemote` sorts incoming changes by version, applies only newer ones, raises the local Lamport counter to at least the incoming value, and never appends to the outbox — a remote change is never re-uploaded.
- **Tombstones prevent resurrection.** A delete is a durable tombstone row that stays until a newer remote change supersedes it. Sync never resurrects a deleted record from an older pull, because the tombstone's version always beats older snapshots and the UI filters tombstoned ids.
- **Intermittent relay, not a permanent connection.** The coordinator pushes pending changes and pulls by cursor at startup, on the `online` event, on window `focus`, on `visibilitychange` to visible, after auth/unlock changes, and on a 5-minute timer that runs only while the document is visible. There is no WebSocket and no persistent connection. Batches are capped at 100 changes; failed cycles retry with exponential backoff (5 s, 30 s, 5 min, capped at 15 min) and the delay resets after success. The pull cursor advances only after a batch decrypts and applies cleanly, so a failed apply is retried rather than skipped.
- **Why a relay instead of peer-to-peer-only sync.** Direct device-to-device sync was rejected: devices are rarely online at the same time, browsers forbid unrestricted background networking on mobile, and NAT/firewall traversal effectively rules out serverless P2P. A shared, append-only relay gives every device an always-on mailbox to drain on its own schedule via cursor pulls — while remaining intermittent, since clients connect only on triggers rather than holding a permanent connection.
- **Storage shape** at the relay reveals little: rows carry only a userId, an opaque dedup id, server sequence, timestamp, and ciphertext. Row count and timing are visible to the server, but the plaintext record, its name, and its delete/update semantics never are.

## Mobile lifecycle

The sync session and passphrase live in page memory for the current tab, so they are lost when the page is closed or reloaded; the next visit re-signs-in and re-unlocks before syncing. On mobile/PWA, browsers suspend background tabs and may throttle service workers, so timers, `focus`/`visibilitychange`, and network activity do not fire reliably while the app is suspended or closed. Sync therefore runs while the app is open and visible (startup, focus, visibility, 5-minute visible timer) and on the next launch after offline edits; there is no guaranteed background sync, and nothing depends on one. Offline edits always queue in the outbox and flush on the next live trigger.

## Failure modes

- Network / 429 / 5xx → user-facing errors; Shabbat may show **degraded** cached times
- `@hebcal/core` unavailable (shouldn't happen — it's local) → fall back to Hebcal API
- Abort on rapid city switches → stale responses discarded
- QuotaExceeded on remembrances → explicit export guidance
- Corrupt IndexedDB / legacy localStorage → fresh local store, legacy data migrates once via the metadata marker; location preference ignored
- Relay unavailable or failing during a cycle → local writes unaffected; pending changes stay in the outbox and retry with backoff
- Supabase not configured → sync features hidden; app works fully offline
- Capacitor not available → web Notifications API used instead

## Offline strategy

1. **Primary**: `@hebcal/core` runs entirely in the browser — date conversion, holidays, parashat, zmanim, and candle-lighting times all work offline
2. **Secondary**: Hebcal REST API for Shabbat times, wrapped with a durable `responseCache` that serves last-good responses with `_degraded: true` when the network fails
3. **App shell**: vite-plugin-pwa generates a service worker that precaches the app shell and uses NetworkFirst strategy for API calls
4. **Remembrances**: IndexedDB persists records, tombstones, and the outbox offline; edits made while offline flush to the relay on the next online/focus/visibility/startup trigger

## Multi-device strategy

| Target | Approach | Status |
|---|---|---|
| Phone | Responsive Tailwind layout + PWA install | ✅ Working |
| Tablet | Responsive layout with wider grids | ✅ Working |
| Laptop | Full desktop layout | ✅ Working |
| Smart display | Kiosk mode (`?kiosk` URL param) — always-on Shabbat/zmanim display | 🚧 Planned |
| iOS app | Capacitor native shell | 🚧 Planned |
| Android app | Capacitor native shell | 🚧 Planned |

## Accessibility baseline

- Skip link, labelled forms, dialog with accessible name
- Converter tabs: `role="tablist"` + arrow-key navigation
- Loading regions expose `aria-busy`
- Remembrance list is a labelled list; delete controls have accessible names
- Focus returns to the opener when the remembrance dialog closes
- `prefers-reduced-motion` disables non-essential transitions
- RTL layout fully supported when Hebrew language is active

## Testing strategy

- **Unit (Vitest):** domain rules, adapters with injected `fetch`/storage, application services with fake ports, React components with Testing Library
- **Typecheck:** `tsc --noEmit` on every CI run
- **E2E (Playwright):** convert, Shabbat city switch, remembrance save/export against the production build; offline local-first persistence across a reload; and a deterministic two-context sync/tombstone scenario that injects a shared in-memory relay through the composition seam — no real Supabase, no network — asserting that creates propagate, deletes tombstone, and reloads never resurrect a deleted record

## Roadmap

### Phase 1 — Foundation (complete)
- [x] React 19 + TypeScript + Vite + Tailwind v4
- [x] i18next with en/he translations and RTL
- [x] `@hebcal/core` local calendar adapter (offline-first)
- [x] Hebcal API fallback with durable cache
- [x] Converter, Shabbat, Remembrances features
- [x] Dark mode (system-aware + manual toggle)
- [x] Hero after-sunset fix
- [x] PWA service worker + manifest
- [x] Capacitor core integration

### Phase 2 — Feature expansion (complete)
- [x] Hebrew calendar month view
- [x] Zmanim panel
- [x] Notifications (Web + Capacitor local notifications)
- [x] Daf Yomi / Mishna Yomi tracker
- [x] Expanded remembrance types (Bar/Bat Mitzvah, Hebrew birthday, fast days)
- [x] Multi-location support
- [x] Kiosk mode

### Phase 3 — Sync and platform (in progress)
- [x] Supabase integration with client-side encryption
- [x] iCal/Google Calendar export
- [x] Community holiday guide / weekly panel
- [ ] Capacitor native iOS/Android builds
- [ ] Mobile-first PWA install prompt

### Phase 4 — Polish (in progress)
- [x] Full test suite migration (Vitest + Playwright)
- [x] CI workflow update
- [ ] Performance optimization (code splitting, lazy loading)
- [ ] Accessibility audit
