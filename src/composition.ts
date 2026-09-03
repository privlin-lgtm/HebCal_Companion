/**
 * Composition root — the only place that knows concrete adapters.
 * Wires up all services with their infrastructure implementations.
 */
import { createConvertService } from "./application/convertService";
import { createRemembranceService } from "./application/remembranceService";
import { createShabbatService } from "./application/shabbatService";
import type {
  CalendarPort,
  Clock,
  GeocoderPort,
  IdGenerator,
  LocationStore,
  NotificationPort,
  RemembranceRepository,
  SyncPort,
  ThemeStore,
} from "./application/ports";
import { createHebcalLocalCalendar } from "./infrastructure/hebcalLocal";
import { createHebcalApiCalendar } from "./infrastructure/hebcalApi";
import { createHttpClient } from "./infrastructure/httpClient";
import { createOpenMeteoGeocoder } from "./infrastructure/openMeteoGeocoder";
import { createRemembranceRepository } from "./infrastructure/remembranceRepository";
import { createLocationStore } from "./infrastructure/locationStore";
import { createResponseCache, type ResponseCache } from "./infrastructure/responseCache";
import { createCachedCalendar } from "./infrastructure/cachedCalendar";
import { createClock } from "./infrastructure/clock";
import { createIdGenerator } from "./infrastructure/idGenerator";
import { createThemeStore } from "./infrastructure/themeStore";
import { createWebNotifications } from "./infrastructure/webNotifications";
import { createSupabaseSync } from "./infrastructure/supabaseSync";

export type AppServices = {
  convertService: ReturnType<typeof createConvertService>;
  shabbatService: ReturnType<typeof createShabbatService>;
  remembranceService: ReturnType<typeof createRemembranceService>;
  calendar: CalendarPort;
  geocoder: GeocoderPort;
  themeStore: ThemeStore;
  notifications: NotificationPort;
  sync: SyncPort;
  clock: Clock;
};

export function createServices(): AppServices {
  const httpJson = createHttpClient();
  const responseCache: ResponseCache = createResponseCache();

  // Local calendar (offline-first) — primary
  const localCalendar = createHebcalLocalCalendar();

  // API calendar (fallback) — wrapped with cache for degraded mode
  const apiCalendar = createHebcalApiCalendar({ httpJson });
  const cachedApiCalendar = createCachedCalendar({ calendar: apiCalendar, cache: responseCache });

  // Use local calendar for conversion (offline), API for Shabbat (with cache)
  // For now, use local as primary since it handles everything
  const calendar: CalendarPort = {
    convert: (params, options) => localCalendar.convert(params, options),
    convertLocal: (params) => localCalendar.convertLocal!(params),
    getHebrewDate: (date, afterSunset) => localCalendar.getHebrewDate!(date, afterSunset),
    getShabbat: (location, options) => cachedApiCalendar.getShabbat(location, options),
    getZmanim: (location, date, options) => localCalendar.getZmanim!(location, date, options),
    getMonthData: (hebrewYear, hebrewMonth, options) => localCalendar.getMonthData!(hebrewYear, hebrewMonth, options),
    getWeeklyEvents: (options) => localCalendar.getWeeklyEvents!(options),
    getLearning: (date, options) => localCalendar.getLearning!(date, options),
  };

  const geocoder: GeocoderPort = createOpenMeteoGeocoder({ httpJson });
  const remembrances: RemembranceRepository = createRemembranceRepository();
  const locationStore: LocationStore = createLocationStore();
  const ids: IdGenerator = createIdGenerator();
  const clock: Clock = createClock();
  const themeStore = createThemeStore();
  const notifications = createWebNotifications();
  const sync = createSupabaseSync();

  const convertService = createConvertService({ calendar });
  const shabbatService = createShabbatService({ calendar, geocoder, locationStore });
  const remembranceService = createRemembranceService({ calendar, remembrances, ids, clock });

  return {
    convertService,
    shabbatService,
    remembranceService,
    calendar,
    geocoder,
    themeStore,
    notifications,
    sync,
    clock,
  };
}
