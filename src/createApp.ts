import { createConvertService } from "./application/convertService";
import { createRemembranceService } from "./application/remembranceService";
import { createShabbatService } from "./application/shabbatService";
import type {
  CalendarPort,
  Clock,
  ConvertResult,
  GeocoderPort,
  IdGenerator,
  LocationStore,
  RemembranceRepository,
  StorageLike,
} from "./application/ports";
import { createCachedCalendar } from "./infrastructure/cachedCalendar";
import { createClock } from "./infrastructure/clock";
import { createHebcalCalendar } from "./infrastructure/hebcalCalendar";
import { createHttpClient, type HttpJson } from "./infrastructure/httpClient";
import { createIdGenerator } from "./infrastructure/idGenerator";
import { createLocationStore } from "./infrastructure/locationStore";
import { createOpenMeteoGeocoder } from "./infrastructure/openMeteoGeocoder";
import { createRemembranceRepository } from "./infrastructure/remembranceRepository";
import { createResponseCache, type ResponseCache } from "./infrastructure/responseCache";
import { createConverterController } from "./ui/converterController.js";
import { createRemembrancesController } from "./ui/remembrancesController.js";
import { createShabbatController } from "./ui/shabbatController.js";
import { createToast } from "./ui/toast.js";

export type AppOverrides = {
  httpJson?: HttpJson;
  fetchImpl?: typeof fetch;
  calendar?: CalendarPort;
  converterCache?: Map<string, Promise<ConvertResult>>;
  responseCache?: ResponseCache;
  geocoder?: GeocoderPort;
  remembrances?: RemembranceRepository;
  locationStore?: LocationStore;
  storage?: StorageLike;
  ids?: IdGenerator;
  cryptoImpl?: Crypto;
  clock?: Clock;
  now?: () => Date;
  convertService?: ReturnType<typeof createConvertService>;
  shabbatService?: ReturnType<typeof createShabbatService>;
  remembranceService?: ReturnType<typeof createRemembranceService>;
  showToast?: (message: string, isError?: boolean) => void;
  root?: ParentNode | Document;
};

/**
 * Composition root — the only place that knows concrete adapters.
 * Pass overrides in tests to swap ports.
 */
export function createApp(overrides: AppOverrides = {}) {
  const httpJson = overrides.httpJson || createHttpClient({ fetchImpl: overrides.fetchImpl });
  const responseCache = overrides.responseCache || createResponseCache({ storage: overrides.storage });
  const calendar = overrides.calendar || createCachedCalendar({
    calendar: createHebcalCalendar({ httpJson, cache: overrides.converterCache }),
    cache: responseCache,
  });
  const geocoder = overrides.geocoder || createOpenMeteoGeocoder({ httpJson });
  const remembrances = overrides.remembrances || createRemembranceRepository({ storage: overrides.storage });
  const locationStore = overrides.locationStore || createLocationStore({ storage: overrides.storage });
  const ids = overrides.ids || createIdGenerator({ cryptoImpl: overrides.cryptoImpl });
  const clock = overrides.clock || createClock({ now: overrides.now });

  const convertService = overrides.convertService || createConvertService({ calendar });
  const shabbatService = overrides.shabbatService || createShabbatService({ calendar, geocoder, locationStore });
  const remembranceService = overrides.remembranceService || createRemembranceService({
    calendar,
    remembrances,
    ids,
    clock,
  });

  const showToast = overrides.showToast || createToast({ root: overrides.root as Document | undefined });
  const root = overrides.root || document;

  const converter = createConverterController({ convertService, showToast, root });
  const shabbat = createShabbatController({ shabbatService, showToast, root });
  const remembranceUi = createRemembrancesController({ remembranceService, showToast, root });

  function start() {
    converter.bind();
    shabbat.bind();
    remembranceUi.bind();
    converter.loadToday().then((data) => remembranceUi.refreshUpcoming(data?.hy));
  }

  return {
    start,
    services: { convertService, shabbatService, remembranceService },
    ports: { calendar, geocoder, remembrances, locationStore, ids, clock, httpJson, responseCache },
  };
}
