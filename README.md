# Or Zarua

**Hebrew Calendar Companion** — a private, local-first planner for Hebrew dates, Shabbat times, zmanim, and remembrances. Works across phone, tablet, laptop, and smart display.

[![CI](https://github.com/privlin-lgtm/HebCal_Companion/actions/workflows/ci.yml/badge.svg)](https://github.com/privlin-lgtm/HebCal_Companion/actions/workflows/ci.yml)
[Live demo](https://privlin-lgtm.github.io/HebCal_Companion/)

## Features

### Current

- **Date converter** — Gregorian ↔ Hebrew with after-sunset support and local offline conversion via `@hebcal/core`
- **Shabbat times** — candle-lighting and Havdalah by city, ZIP, or coordinates, with offline degraded cache
- **Remembrances** — save yahrzeits, anniversaries, Bar/Bat Mitzvahs, Hebrew birthdays, and fast days locally; compute next secular observance date
- **Export / import** — JSON backups with schema validation
- **Offline-first** — local Hebrew date math via `@hebcal/core`; last successful API responses cached for degraded mode
- **Bilingual** — English and Hebrew with full RTL layout support (i18next)
- **Dark mode** — system-aware with manual toggle
- **PWA** — installable, offline app shell via service worker
- **Privacy** — no accounts required, remembrance names never leave the browser, CSP headers, schema-validated storage

### Planned (in progress)

- **Hebrew calendar month view** — grid with parashat, holidays, Omer, Daf Yomi
- **Zmanim panel** — daily halachic times (Alot, Misheyakir, Sof Zman Shma/Tfilla, Chatzot, Mincha, Plag, Tzeit)
- **Notifications** — yahrzeit and candle-lighting reminders (Web Notifications + Capacitor local notifications)
- **Daf Yomi / Mishna Yomi tracker** — daily learning schedule
- **Multi-location** — save and switch between home, travel, and community locations
- **Supabase sync** — encrypted cross-device sync with client-side encryption (E2E)
- **Kiosk mode** — always-on Shabbat/zmanim display for smart displays and mounted tablets
- **iCal export** — subscribe to yahrzeit and Shabbat times in any calendar app
- **Community holiday guide** — weekly panel with upcoming holidays, special Shabbatot, seasonal notes
- **Capacitor** — native iOS/Android apps from the same codebase with push notifications

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
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173/HebCal_Companion/`).

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
