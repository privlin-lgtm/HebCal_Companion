# Or Zarua

A dependency-free Hebrew calendar companion powered by the free Hebcal APIs.

Open `index.html` in a modern browser, or serve this folder with any static web server.

## Features

- Gregorian and Hebrew date conversion, including an after-sunset option
- Shabbat candle-lighting and Havdalah times for major cities, a searchable city-and-country field, US ZIP codes, and Hebcal city codes
- Private Yahrzeit and anniversary tracking with future secular dates calculated from Hebrew dates

Calendar and zmanim data: [Hebcal.com](https://www.hebcal.com/). City search uses the free [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) to resolve coordinates and time zone before requesting Hebcal times. Remembrance records remain in browser `localStorage`.
