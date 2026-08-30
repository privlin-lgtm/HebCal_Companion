import { createConvertService } from "./application/convertService.js";
import { createRemembranceService } from "./application/remembranceService.js";
import { createShabbatService } from "./application/shabbatService.js";
import { createClock } from "./infrastructure/clock.js";
import { createHebcalCalendar } from "./infrastructure/hebcalCalendar.js";
import { createHttpClient } from "./infrastructure/httpClient.js";
import { createIdGenerator } from "./infrastructure/idGenerator.js";
import { createLocationStore } from "./infrastructure/locationStore.js";
import { createOpenMeteoGeocoder } from "./infrastructure/openMeteoGeocoder.js";
import { createRemembranceRepository } from "./infrastructure/remembranceRepository.js";
import { createConverterController } from "./ui/converterController.js";
import { createRemembrancesController } from "./ui/remembrancesController.js";
import { createShabbatController } from "./ui/shabbatController.js";
import { createToast } from "./ui/toast.js";

/**
 * Composition root — the only place that knows concrete adapters.
 * Pass overrides in tests to swap ports.
 */
export function createApp(overrides = {}) {
  const httpJson = overrides.httpJson || createHttpClient({ fetchImpl: overrides.fetchImpl });
  const calendar = overrides.calendar || createHebcalCalendar({ httpJson, cache: overrides.converterCache });
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

  const showToast = overrides.showToast || createToast({ root: overrides.root });
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
    ports: { calendar, geocoder, remembrances, locationStore, ids, clock, httpJson },
  };
}
