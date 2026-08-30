# HebCal Companion

HebCal Companion is a lightweight browser-based web app for working with Hebrew calendar information in one place. It helps solve a common practical problem: converting between Gregorian and Hebrew dates, checking Shabbat times for a location, and keeping track of remembrances such as yahrzeits or anniversaries without relying on a complex setup or account system.

The app is fully client-side and uses free public APIs for live calendar and location data. Saved remembrances stay in the browser's local storage, so personal entries remain on the user's computer.

## Features

- Convert Gregorian dates to Hebrew dates
- Convert Hebrew dates to Gregorian dates
- Support after-sunset conversion behavior
- View Shabbat candle-lighting and Havdalah times
- Search Shabbat times by preset city, city and country, US ZIP code, or Hebcal city code
- Save yahrzeit or anniversary remembrances and calculate the next upcoming secular observance date

## How To Run

On another computer, clone or download this project folder and open the `HebCal_Companion` directory.

Because this is a static web app, there is no build step and no package installation required. You can run it in either of these ways:

1. Open `index.html` directly in a modern browser.
2. Or serve the folder with any simple static server and open it in the browser.

Example using VS Code Live Server:

1. Install the Live Server extension.
2. Open the project folder in VS Code.
3. Right-click `index.html` and choose `Open with Live Server`.

## Architecture

The app follows a small Clean Architecture layout under `src/`:

- `domain/` — pure calendar, location, and remembrance rules (no I/O)
- `application/` — use-case services that depend on injected ports
- `infrastructure/` — Hebcal, Open-Meteo, and localStorage adapters
- `ui/` — DOM controllers
- `createApp.js` — composition root / dependency injection

`main.js` wires production adapters and starts the UI.

## Data Sources

Calendar and zmanim data come from [Hebcal](https://www.hebcal.com/). City lookup uses the [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api).

## Tests

```bash
npm install
npm test
```
