/** Small built-in city database for offline zmanim/shabbat calculation.
 * Maps geonameids to coordinates + timezone so the local @hebcal/core adapter
 * can calculate times without a network call for known cities. */

export type CityRecord = {
  lat: number;
  lng: number;
  tzid: string;
  isIsrael: boolean;
  name: string;
  countryCode: string;
};

const CITIES: Record<string, CityRecord> = {
  // Jerusalem
  "281184": { lat: 31.78, lng: 35.22, tzid: "Asia/Jerusalem", isIsrael: true, name: "Jerusalem", countryCode: "IL" },
  // Buenos Aires
  "3448439": { lat: -34.60, lng: -58.38, tzid: "America/Argentina/Buenos_Aires", isIsrael: false, name: "Buenos Aires", countryCode: "AR" },
  // New York
  "5128581": { lat: 40.72, lng: -74.0, tzid: "America/New_York", isIsrael: false, name: "New York", countryCode: "US" },
  // London
  "2643743": { lat: 51.51, lng: -0.13, tzid: "Europe/London", isIsrael: false, name: "London", countryCode: "GB" },
  // Sydney
  "2147714": { lat: -33.87, lng: 151.21, tzid: "Australia/Sydney", isIsrael: false, name: "Sydney", countryCode: "AU" },
  // Tel Aviv
  "293397": { lat: 32.08, lng: 34.78, tzid: "Asia/Jerusalem", isIsrael: true, name: "Tel Aviv", countryCode: "IL" },
  // Paris
  "2988507": { lat: 48.85, lng: 2.35, tzid: "Europe/Paris", isIsrael: false, name: "Paris", countryCode: "FR" },
  // Los Angeles
  "5368361": { lat: 34.05, lng: -118.24, tzid: "America/Los_Angeles", isIsrael: false, name: "Los Angeles", countryCode: "US" },
  // Chicago
  "4887398": { lat: 41.85, lng: -87.65, tzid: "America/Chicago", isIsrael: false, name: "Chicago", countryCode: "US" },
  // Miami
  "4164138": { lat: 25.79, lng: -80.32, tzid: "America/New_York", isIsrael: false, name: "Miami", countryCode: "US" },
  // Toronto
  "6167865": { lat: 43.70, lng: -79.42, tzid: "America/Toronto", isIsrael: false, name: "Toronto", countryCode: "CA" },
  // Berlin
  "2950159": { lat: 52.52, lng: 13.40, tzid: "Europe/Berlin", isIsrael: false, name: "Berlin", countryCode: "DE" },
  // Melbourne
  "2158177": { lat: -37.81, lng: 144.96, tzid: "Australia/Melbourne", isIsrael: false, name: "Melbourne", countryCode: "AU" },
  // Johannesburg
  "993800": { lat: -26.20, lng: 28.04, tzid: "Africa/Johannesburg", isIsrael: false, name: "Johannesburg", countryCode: "ZA" },
  // Mexico City
  "3530597": { lat: 19.43, lng: -99.13, tzid: "America/Mexico_City", isIsrael: false, name: "Mexico City", countryCode: "MX" },
};

export function lookupGeonameid(id: string): CityRecord | null {
  return CITIES[id] ?? null;
}
