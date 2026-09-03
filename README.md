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
- **Remembrances** — save yahrzeits, anniversaries, Bar/Bat Mitzvahs, Hebrew birthdays, and fast days locally; compute next secular observance date
- **Multi-location** — save, switch, and set a default among home, travel, and community locations
- **Encrypted cross-device sync** — optional Supabase sync; records are AES-GCM encrypted in the browser under a passphrase that never leaves the device
- **Notifications** — yahrzeit reminders via Web Notifications
- **Kiosk mode** — always-on display for smart displays and mounted tablets (`?kiosk`)
- **Export / import** — JSON backups with schema validation, plus iCal export with reminder alarms
- **Offline-first** — local Hebrew date math via `@hebcal/core`; last successful API responses cached for degraded mode
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
| Sync | `@supabase/supabase-js` (encrypted, optional) |
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

The app is fully usable without this. When configured, remembrances can be pushed to and pulled from Supabase, encrypted client-side.

1. Create a Supabase project, then run this once in the SQL editor:

   ```sql
   create table if not exists public.remembrances (
     user_id uuid primary key references auth.users(id) on delete cascade,
     data text not null,
     updated_at timestamptz not null default now()
   );

   alter table public.remembrances enable row level security;

   create policy "Users manage own remembrances"
     on public.remembrances
     as permissive
     for all
     to authenticated
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

   `user_id` must be the primary key: the adapter upserts on it.

2. Copy `.env.example` to `.env.local` and fill in your project URL and publishable (anon) key. Never put a `service_role` or `sb_secret_` key in a client bundle.

3. Restart `npm run dev`. A sync panel appears in the Remembrances section. Sign in, then enter an **encryption passphrase**.

The passphrase is separate from your account password. A 256-bit AES-GCM key is derived from it with PBKDF2-SHA256 (210,000 iterations) and held in memory for the session only, so the server stores nothing but ciphertext. Use the same passphrase on every device. **If you lose it, synced data cannot be recovered.**

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
  application/     Use cases (ports in, DTOs out)
    ports.ts       Dependency contracts (CalendarPort, GeocoderPort, etc.)
    convertService.ts
    shabbatService.ts
    remembranceService.ts
  infrastructure/  Adapters (Hebcal, Open-Meteo, localStorage, Supabase, Capacitor)
    hebcalLocal.ts  @hebcal/core offline adapter (primary)
    hebcalApi.ts    Hebcal REST API adapter (fallback)
    cachedCalendar.ts  Degrade-mode decorator
    responseCache.ts   Web Storage response cache
    openMeteoGeocoder.ts
    remembranceRepository.ts
    locationStore.ts
    supabaseSync.ts   Encrypted cross-device sync
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

## Data sources & privacy

- Calendar / zmanim / holidays: [Hebcal](https://www.hebcal.com/) (API) + `@hebcal/core` (local)
- City lookup: [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api)
- Sync (optional): [Supabase](https://supabase.com/) — remembrances are encrypted client-side before upload
- Remembrance **names** stay in your browser
- Original memorial **dates** are sent to Hebcal only to convert and refresh upcoming observance dates
- No analytics, no tracking, no third-party scripts

## Multi-device

- **Web/PWA** — responsive layout for phone, tablet, and laptop; installable from any browser
- **Kiosk mode** — full-screen always-on display for mounted tablets (`?kiosk` URL parameter)
- **Native (future)** — Capacitor wraps the same React codebase into iOS/Android apps with push notification support

## License

Personal / portfolio project. Calendar data © respective providers.
