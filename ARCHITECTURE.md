# Architecture

Or Zarua (Hebrew Calendar Companion) is a local-first web application built with React 19, TypeScript, and Tailwind CSS v4. Calendar math runs locally via `@hebcal/core` for offline-first operation. An optional Supabase backend provides encrypted cross-device sync. Capacitor enables native iOS/Android deployment from the same codebase.

## Goals

1. Convert Gregorian ↔ Hebrew dates, including after-sunset behavior — **offline-first** via `@hebcal/core`.
2. Show upcoming Shabbat candle-lighting and Havdalah for any location, with degraded cache when offline.
3. Store yahrzeits, anniversaries, Bar/Bat Mitzvahs, Hebrew birthdays, and fast days privately on-device.
4. Compute next secular observance date for each remembrance.
5. Provide daily zmanim (halachic times) for the selected location.
6. Display a Hebrew calendar month view with parashat, holidays, and learning schedule.
7. Support English and Hebrew with full RTL layout.
8. Work across phone, tablet, laptop, and smart display (kiosk mode).
9. Optionally sync encrypted remembrances across devices via Supabase.
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
| Privacy default | LocalStorage + export/import | Memorial data should not require an account |
| Sync (optional) | Supabase with client-side encryption | Cross-device persistence; remembrances encrypted before upload; server only sees ciphertext |
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
- `RemembranceRepository` — list/save/merge upcoming patches
- `LocationStore` — last Shabbat location preference
- `MultiLocationStore` — saved locations (home, travel, community)
- `SyncPort` — encrypted cross-device sync (auth, passphrase unlock/lock, push, pull)
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
- **Conflict handling** is last-write-wins per user, softened by an explicit merge on download: `pull()` returns records that are merged into local state by id, so downloading never silently drops local additions.
- **Storage shape** is one row per user (`user_id` primary key) holding a single opaque blob. The schema reveals nothing beyond row existence and last-update time, though blob length still leaks a rough record count.

## Failure modes

- Network / 429 / 5xx → user-facing errors; Shabbat may show **degraded** cached times
- `@hebcal/core` unavailable (shouldn't happen — it's local) → fall back to Hebcal API
- Abort on rapid city switches → stale responses discarded
- QuotaExceeded on remembrances → explicit export guidance
- Corrupt localStorage → empty list / ignored location preference
- Supabase not configured → sync features hidden; app works fully offline
- Capacitor not available → web Notifications API used instead

## Offline strategy

1. **Primary**: `@hebcal/core` runs entirely in the browser — date conversion, holidays, parashat, zmanim, and candle-lighting times all work offline
2. **Secondary**: Hebcal REST API for Shabbat times, wrapped with a durable `responseCache` that serves last-good responses with `_degraded: true` when the network fails
3. **App shell**: vite-plugin-pwa generates a service worker that precaches the app shell and uses NetworkFirst strategy for API calls

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
- **E2E (Playwright):** convert, Shabbat city switch, remembrance save/export against the production build

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
