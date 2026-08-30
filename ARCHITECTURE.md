# Architecture

Or Zarua (Hebrew Calendar Companion) is a static, local-first web client. There is no application server and no user accounts. Calendar data comes from public APIs; personal remembrances stay in the browser.

## Goals

1. Convert Gregorian ↔ Hebrew dates, including after-sunset behavior.
2. Show upcoming Shabbat candle-lighting and Havdalah for a chosen location.
3. Store yahrzeits / anniversaries privately on-device and compute the next secular observance date.
4. Remain understandable, testable, and deployable without a backend.

## Layering

```
main.ts
  └─ createApp.ts          composition root (DI)
       ├─ application/     use cases (ports in, DTOs out)
       ├─ domain/          pure rules (no fetch, no DOM, no storage)
       ├─ infrastructure/  Hebcal, Open-Meteo, localStorage, caches
       └─ ui/              DOM controllers
```

Dependency rule: **domain ← application ← infrastructure/ui**. Outer layers may depend inward; domain never depends outward.

## Why this shape (decision log)

| Decision | Choice | Why |
|---|---|---|
| Framework | None (Vite + vanilla modules) | Problem fits a small static client; DI factories give seams without React/Angular cost. |
| Architecture | Clean Architecture lite | Keeps calendar math and storage rules unit-testable; adapters are replaceable. |
| Language | TypeScript for domain/application/infrastructure | Ports and entities are contracts; UI remains JS with declaration files. |
| Hosting | GitHub Pages static build | Matches “no backend”; CI deploys `dist/`. |
| Privacy default | LocalStorage + export/import | Memorial data should not require an account. |
| Offline | Durable response cache around Hebcal | Degraded Shabbat/convert responses when the network fails, using last good payload. |

## Ports

Defined in `src/application/ports.ts`:

- `CalendarPort` — convert dates, fetch Shabbat payload
- `GeocoderPort` — city/country → coordinates + timezone
- `RemembranceRepository` — list/save/merge upcoming patches
- `LocationStore` — last Shabbat location preference
- `Clock` / `IdGenerator` — injectable time and ids for tests

## Threat model (remembrances)

| Asset | Risk | Mitigation |
|---|---|---|
| Remembrance names | Readable by anyone with device/browser access | On-device only; no sync; export is explicit user action |
| Memorial dates | Sent to Hebcal during convert/refresh | Required for next-observance calculation; disclosed in docs; names are not sent |
| Import files | Malicious JSON | Schema validation; reject binary/non-JSON; cap at 200 rows |
| XSS | Injected HTML in names/events | Render with `textContent` only |
| Supply chain | Compromised deps | Minimal runtime deps (none in production bundle beyond app code); lockfile + CI |

**Non-goals:** multi-user auth, server-side persistence, end-to-end encryption of localStorage (the OS user already owns the profile).

## Failure modes

- Network / 429 / 5xx → user-facing errors; Shabbat may show **degraded** cached times.
- Abort on rapid city switches → stale responses discarded.
- QuotaExceeded on remembrances → explicit export guidance.
- Corrupt localStorage → empty list / ignored location preference.

## Testing strategy

- **Unit (Vitest):** domain rules, adapters with injected `fetch`/storage, application services with fake ports.
- **Typecheck:** `tsc --noEmit` on every CI run.
- **E2E (Playwright):** convert, Shabbat city switch, remembrance save/export against the production build.

## Accessibility baseline

- Skip link, labelled forms, dialog with accessible name
- Converter tabs: `role="tablist"` + arrow-key navigation
- Loading regions expose `aria-busy`
- Remembrance list is a labelled list; delete controls have accessible names
- Focus returns to the opener when the remembrance dialog closes
- `prefers-reduced-motion` disables non-essential transitions
