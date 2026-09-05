# Or Zarua

**Hebrew Calendar Companion** — a private, local-first planner for Hebrew dates, Shabbat times, zmanim, and remembrances. Works across phone, tablet, laptop, and smart display.

[![CI](https://github.com/privlin-lgtm/HebCal_Companion/actions/workflows/ci.yml/badge.svg)](https://github.com/privlin-lgtm/HebCal_Companion/actions/workflows/ci.yml)
[Live demo](https://privlin-lgtm.github.io/HebCal_Companion/)

## Features

### Current

- **Date converter** — Gregorian ↔ Hebrew with after-sunset support and local offline conversion via `@hebcal/core`
- **Shabbat times** — candle-lighting and Havdalah by city, ZIP, or coordinates, with offline degraded cache
- **Hebrew calendar month view** — grid with parashat, holidays, Omer, and Daf Yomi
- **Zmanim panel** — daily halachic times (Alot, Misheyakir, Sof Zman Shma/Tfilla, Chatzot, Mincha, Plag, Tzeit)
- **Daily learning** — Daf Yomi and Mishna Yomi schedule
- **Weekly guide** — upcoming holidays, special Shabbatot, and seasonal notes
- **Remembrances** — save yahrzeits, anniversaries, Bar/Bat Mitzvahs, Hebrew birthdays, and fast days locally in IndexedDB; compute next secular observance date
- **Multi-location** — save, switch, and set a default among home, travel, and community locations
- **Encrypted cross-device sync** — optional, opt-in relay sync on top of the local store: local edits queue in an outbox and push automatically when the app starts, comes back online, or regains focus/visibility, AES-GCM encrypted in the browser under a passphrase that never leaves the device
- **Notifications** — yahrzeit reminders via Web Notifications
- **Kiosk mode** — always-on display for smart displays and mounted tablets (`?kiosk`)
- **Export / import** — JSON backups with schema validation, plus iCal export with reminder alarms; explicit recovery and portability path that works with or without sync
- **Offline-first** — local Hebrew date math via `@hebcal/core`; remembrances persist in IndexedDB across reloads; last successful API responses cached for degraded mode
- **Bilingual** — English and Hebrew with full RTL layout support (i18next)
- **Dark mode** — system-aware with manual toggle
- **PWA** — installable, offline app shell via service worker
- **Privacy** — works fully without an account; remembrance names never leave the browser unencrypted; CSP headers and schema-validated storage

### Planned

- **Capacitor native builds** — iOS/Android apps from the same codebase with local push notifications (bridge is in place, shells not yet published)

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS v4 (logical properties for RTL) |
| i18n | i18next + react-i18next (en/he) |
| Calendar math | `@hebcal/core` (offline-first) |
| API fallback | Hebcal REST API + Open-Meteo Geocoding |
| Sync | `@supabase/supabase-js` (encrypted, optional, intermittent relay) |
| PWA | `vite-plugin-pwa` (Workbox) |
| Native shell | `@capacitor/core` (iOS/Android, future) |
| Validation | `zod` (runtime schema validation) |
| Dates | `date-fns` |
| Testing | Vitest (unit) + Playwright (E2E) |

## Quick start

```bash
npm install --legacy-peer-deps
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173/HebCal_Companion/`).

> `--legacy-peer-deps` is required because `react-i18next` still declares a peer range that predates the TypeScript version used here.

## Cross-device sync (optional)

The app is fully usable without this. Remembrances are stored locally in **IndexedDB** (the local source of truth) and work offline. When configured, changes sync automatically — but intermittently — to **Supabase** as an encrypted relay: the server only stores opaque ciphertext rows and is never the authoritative store.

1. Create a Supabase project, then run the relay schema once in the SQL editor: open **`docs/supabase-sync.sql`** and execute it. It creates the append-only `public.sync_changes` table (an encrypted change log with `(user_id, op_id)` idempotency and row-level security) and keeps the legacy `public.remembrances` table readable for migration.

2. Copy `.env.example` to `.env.local` and fill in your project URL and publishable (anon) key. Never put a `service_role` or `sb_secret_` key in a client bundle.

3. Restart `npm run dev`. A sync panel appears in the Remembrances section. Sign in, then enter an **encryption passphrase**.

### How automatic sync works

- Every local create, update, or delete is written to IndexedDB immediately and queued in an outbox; local writes never wait on the network.
- A sync coordinator automatically pushes pending changes and pulls remote changes when the app starts, when the connection comes back online, when the window regains focus, when the tab becomes visible, and on a ~5-minute timer while the tab stays visible. Sync is opt-in: it only runs after you sign in **and** unlock with your passphrase.
- Deletes are durable tombstones, so a record removed on one device stays removed everywhere instead of resurrecting from an older copy.
- **"Sync now"** remains in the panel for an immediate manual sync. **Export / import** stays the explicit recovery and portability path and works with or without sync.

### Passphrase

The passphrase is separate from your account password. A 256-bit AES-GCM key is derived from it with PBKDF2-SHA256 (210,000 iterations) and held in memory for the session only, so the server stores nothing but ciphertext. Use the same passphrase on every device. **If you lose it, synced data cannot be recovered.**

### Mobile / PWA limitations

Browsers can suspend background tabs and throttle service workers, so sync runs while the app is open and visible (or the next time you open it) — there is no guaranteed background sync while the app is closed or suspended. The relay connection is intermittent by design and never stays open permanently.

Production build:

```bash
npm run build
npm run preview
```

## Architecture

Clean Architecture with React:

```
src/
  domain/          Pure rules (no React, no fetch, no DOM, no storage)
    calendar.ts    Date conversion, Shabbat projection, observance walking
    remembrance.ts Entity validation, import/export, merge logic
    location.ts    Location value object, Hebcal param mapping
    dates.ts       Date formatting, after-sunset logic
    zmanim.ts      Zmanim types and ordering
    learning.ts    Daily learning types
    sync.ts        SyncChange/SyncVersion/cursor types + conflict ordering
  application/     Use cases (ports in, DTOs out)
    ports.ts       Dependency contracts (CalendarPort, GeocoderPort, etc.)
    convertService.ts
    shabbatService.ts
    remembranceService.ts
  infrastructure/  Adapters (Hebcal, Open-Meteo, localStorage, IndexedDB, Supabase, Capacitor)
    hebcalLocal.ts  @hebcal/core offline adapter (primary)
    hebcalApi.ts    Hebcal REST API adapter (fallback)
    cachedCalendar.ts  Degrade-mode decorator
    responseCache.ts   Web Storage response cache
    openMeteoGeocoder.ts
    remembranceRepository.ts
    locationStore.ts
    indexedDb.ts        IndexedDB schema + transaction helpers
    indexedDbRemembranceRepository.ts  Records/outbox/tombstones/cursor
    supabaseSync.ts     Encrypted relay + auth
    syncCoordinator.ts  Intermittent push/pull scheduling + retries
    webNotifications.ts
    capacitorBridge.ts
    themeStore.ts
  components/      React UI
    layout/        Header, Hero, AboutStrip, ToastContainer
    converter/     Date converter
    shabbat/       Shabbat times
    remembrances/  Remembrances list + dialog
  context/         React context (service injection)
  hooks/           useTheme, useToast
  i18n/            i18next config + en/he translation dictionaries
  composition.ts   Composition root (DI wiring)
  App.tsx          Root component
  main.tsx         React entry point
  styles.css       Tailwind v4 entry + theme tokens
```

Dependency rule: **domain ← application ← infrastructure/components**. Outer layers depend inward; domain never depends outward.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full decision log, threat model, and roadmap.

## Tests

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

E2E coverage includes core flows plus the sync scenarios added with the encrypted-sync work: an offline local-first persistence test (create → reload → still there) and a deterministic two-context sync/tombstone test that shares an in-memory fake relay between two browser contexts — no real Supabase account is ever contacted.

## Data sources & privacy

- Calendar / zmanim / holidays: [Hebcal](https://www.hebcal.com/) (API) + `@hebcal/core` (local)
- City lookup: [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api)
- Sync (optional): [Supabase](https://supabase.com/) — an encrypted relay; changes are AES-GCM encrypted in the browser before upload and synced intermittently
- Remembrance **names** stay in your browser
- Original memorial **dates** are sent to Hebcal only to convert and refresh upcoming observance dates
- No analytics, no tracking, no third-party scripts

## Multi-device

- **Web/PWA** — responsive layout for phone, tablet, and laptop; installable from any browser
- **Kiosk mode** — full-screen always-on display for mounted tablets (`?kiosk` URL parameter)
- **Native (future)** — Capacitor wraps the same React codebase into iOS/Android apps with push notification support

## License

Personal / portfolio project. Calendar data © respective providers.
