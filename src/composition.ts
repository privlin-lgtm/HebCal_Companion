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
  MultiLocationStore,
  NotificationPort,
  RemembranceRepository,
  SyncCoordinator,
  SyncPort,
  ThemeStore,
} from "./application/ports";
import { createHebcalLocalCalendar } from "./infrastructure/hebcalLocal";
import { createHebcalApiCalendar } from "./infrastructure/hebcalApi";
import { createHttpClient } from "./infrastructure/httpClient";
import { createOpenMeteoGeocoder } from "./infrastructure/openMeteoGeocoder";
import { createIndexedDbRemembranceRepository } from "./infrastructure/indexedDbRemembranceRepository";
import { createLocationStore } from "./infrastructure/locationStore";
import { createMultiLocationStore } from "./infrastructure/multiLocationStore";
import { createResponseCache, type ResponseCache } from "./infrastructure/responseCache";
import { createCachedCalendar } from "./infrastructure/cachedCalendar";
import { createClock } from "./infrastructure/clock";
import { createIdGenerator } from "./infrastructure/idGenerator";
import { createThemeStore } from "./infrastructure/themeStore";
import { createWebNotifications } from "./infrastructure/webNotifications";
import { createSupabaseSync, type SupabaseSync } from "./infrastructure/supabaseSync";
import { createSyncCoordinator } from "./infrastructure/syncCoordinator";

/** IndexedDB database name for the local remembrance source of truth. */
const REMEMBRANCE_DB_NAME = "or-zarua-remembrances";

/**
 * Test-only composition seam for Playwright E2E.
 *
 * Only compiled in when the E2E web server builds with `VITE_E2E_TEST_HOOK=1`;
 * in normal production and dev builds this branch is statically dead. When the
 * Playwright test installs a fake sync adapter on this global (via an init
 * script) and the build was made with the hook flag, `createServices()` uses
 * that adapter instead of the real Supabase one, so the two-context sync
 * scenario talks to an in-memory relay and never touches a real account.
 */
const E2E_TEST_SYNC_GLOBAL = "__OR_ZARUA_E2E_TEST_SYNC__";

type E2eTestSyncHook = { createSync: () => SupabaseSync };

function createSyncAdapter(): SupabaseSync {
  if (import.meta.env.VITE_E2E_TEST_HOOK === "1") {
    const hook = (globalThis as Record<string, unknown>)[E2E_TEST_SYNC_GLOBAL] as
      | E2eTestSyncHook
      | undefined;
    if (hook?.createSync) return hook.createSync();
  }
  return createSupabaseSync();
}

export type AppServices = {
  convertService: ReturnType<typeof createConvertService>;
  shabbatService: ReturnType<typeof createShabbatService>;
  remembranceService: ReturnType<typeof createRemembranceService>;
  calendar: CalendarPort;
  geocoder: GeocoderPort;
  themeStore: ThemeStore;
  notifications: NotificationPort;
  sync: SyncPort;
  /** Automatic encrypted sync coordinator; started/cleaned up by the app root. */
  syncCoordinator: SyncCoordinator;
  clock: Clock;
  multiLocationStore: MultiLocationStore;
};

export function createServices(): AppServices {
  const httpJson = createHttpClient();
  const responseCache: ResponseCache = createResponseCache();
  const localCalendar = createHebcalLocalCalendar();
  const apiCalendar = createHebcalApiCalendar({ httpJson });
  const cachedApiCalendar = createCachedCalendar({ calendar: apiCalendar, cache: responseCache });

  const calendar: CalendarPort = {
    convert: (params, options) => localCalendar.convert(params, options),
    convertLocal: (params) => localCalendar.convertLocal!(params),
    getHebrewDate: (date, afterSunset) => localCalendar.getHebrewDate!(date, afterSunset),
    getShabbat: (location, options) => cachedApiCalendar.getShabbat(location, options),
    getZmanim: (location, date, options) => localCalendar.getZmanim!(location, date, options),
    getMonthData: (hebrewYear, hebrewMonth, options) => localCalendar.getMonthData!(hebrewYear, hebrewMonth, options),
    getWeeklyEvents: (options) => localCalendar.getWeeklyEvents!(options),
    getLearning: (date, options) => apiCalendar.getLearning!(date, options),
  };

  const geocoder: GeocoderPort = createOpenMeteoGeocoder({ httpJson });
  const ids: IdGenerator = createIdGenerator();
  const clock: Clock = createClock();

  // IndexedDB is the local source of truth. The repository opens lazily on the
  // first read/write, so constructing it here has no side effects. Legacy
  // localStorage records migrate once on first open and the legacy key is left
  // intact for rollback safety.
  const remembrances: RemembranceRepository = createIndexedDbRemembranceRepository({
    dbName: REMEMBRANCE_DB_NAME,
    legacyStorage: globalThis.localStorage,
    ids,
    clock,
  });

  const locationStore: LocationStore = createLocationStore();
  const themeStore = createThemeStore();
  const notifications = createWebNotifications();
  // E2E test builds may substitute a fake in-memory sync adapter here; the
  // seam is compiled out of normal production/dev builds (see above).
  const sync = createSyncAdapter();
  const multiLocationStore = createMultiLocationStore({ ids });

  const convertService = createConvertService({ calendar });
  const shabbatService = createShabbatService({ calendar, geocoder, locationStore });
  const remembranceService = createRemembranceService({ calendar, remembrances, ids, clock });

  // The coordinator receives the relay and a crypto view that both use the
  // session passphrase held inside the sync closure. The passphrase is never
  // extracted: the coordinator only calls cipher.encrypt/decrypt, which fail
  // cleanly while locked. The coordinator is started and cleaned up by the
  // app root (App.tsx) so its listeners and timers follow the React lifecycle.
  const syncCoordinator = createSyncCoordinator({
    repository: remembrances,
    sync,
    relay: sync.relay,
    cipher: sync.crypto,
    clock,
  });

  return {
    convertService,
    shabbatService,
    remembranceService,
    calendar,
    geocoder,
    themeStore,
    notifications,
    sync,
    syncCoordinator,
    clock,
    multiLocationStore,
  };
}