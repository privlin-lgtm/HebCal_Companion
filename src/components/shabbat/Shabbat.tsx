import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { parseDirectLocation, DEFAULT_LOCATION, DEFAULT_LOCATION_NAME, type Location } from "../../domain/location";
import { useToast } from "../../hooks/useToast";
import type { ShabbatView } from "../../application/ports";

const CITIES = [
  { geonameid: "281184", name: "Jerusalem" },
  { geonameid: "3448439", name: "Buenos Aires" },
  { geonameid: "5128581", name: "New York" },
  { geonameid: "2643743", name: "London" },
  { geonameid: "2147714", name: "Sydney" },
];

export function Shabbat() {
  const { t } = useTranslation();
  const { shabbatService } = useApp();
  const { showToast } = useToast();
  const [view, setView] = useState<ShabbatView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [directLocation, setDirectLocation] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function load(location: Location, fallbackName: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const v = await shabbatService.load(location, fallbackName, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setView(v);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      showToast((err as Error).message, true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function searchAndLoad(c: string, co: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const v = await shabbatService.searchAndLoad(c, co, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setView(v);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message);
      showToast((err as Error).message, true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const saved = shabbatService.initialSelection();
    setActiveChip(saved.location.kind === "geonameid" ? saved.location.id : null);
    load(saved.location, saved.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChipClick(geonameid: string, name: string) {
    setActiveChip(geonameid);
    load({ kind: "geonameid", id: geonameid }, name);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const c = city.trim();
    const co = country.trim();
    const direct = directLocation.trim();
    if (c || co) {
      if (!c || !co) { showToast("Enter both a city and country to search.", true); return; }
      setActiveChip(null);
      searchAndLoad(c, co);
      return;
    }
    if (!direct) { showToast("Enter a city and country, a five-digit US ZIP, or a Hebcal city code.", true); return; }
    const loc = parseDirectLocation(direct);
    setActiveChip(null);
    if (loc) load(loc, direct);
  }

  return (
    <section id="shabbat" className="mx-auto max-w-6xl py-24" aria-labelledby="shabbat-title">
      <div className="flex items-end justify-between gap-8 pb-8">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.13em] text-orange">{t("shabbat.eyebrow")}</p>
          <h2 id="shabbat-title" className="mt-1 text-3xl font-medium leading-none tracking-tight md:text-4xl lg:text-5xl">{t("shabbat.title")}</h2>
        </div>
        <p className="max-w-[330px] text-sm leading-relaxed text-muted">{t("shabbat.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-line md:grid-cols-[0.84fr_1.16fr] dark:border-line-dark">
        {/* Location panel */}
        <div className="bg-warm p-8 dark:bg-warm-dark">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <span className="block text-xs font-bold uppercase tracking-[0.13em] text-muted">{t("shabbat.location")}</span>
              <h3 className="mt-1 text-2xl font-medium tracking-tight">{view?.place || DEFAULT_LOCATION_NAME}</h3>
            </div>
            <span className="text-2xl text-orange" aria-hidden="true">⌖</span>
          </div>

          <div className="mb-6 flex flex-wrap gap-2" aria-label={t("shabbat.majorCities")}>
            {CITIES.map((c) => (
              <button
                key={c.geonameid}
                onClick={() => handleChipClick(c.geonameid, c.name)}
                className={`rounded-full border px-2.5 py-1.5 font-sans text-xs ${activeChip === c.geonameid ? "border-night bg-night text-white" : "border-[#cbc9bf] text-[#49595c] hover:border-night hover:bg-night hover:text-white dark:border-line-dark"}`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="m-0 text-sm text-ink dark:text-ink-dark">{t("shabbat.searchCity")}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="s-city" className="mb-1 block font-sans text-xs font-bold text-[#46555b]">{t("shabbat.city")}</label>
                <input id="s-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Paris" className="w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark" />
              </div>
              <div>
                <label htmlFor="s-country" className="mb-1 block font-sans text-xs font-bold text-[#46555b]">{t("shabbat.country")}</label>
                <input id="s-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. France" className="w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark" />
              </div>
            </div>
            <button type="submit" className="w-full rounded-lg border border-[#bfc5c0] bg-white px-4 py-2.5 font-sans text-sm font-bold text-ink hover:bg-warm dark:border-line-dark dark:bg-warm-dark dark:text-ink-dark">{t("shabbat.findCity")}</button>

            <div className="my-4 flex items-center gap-2 font-sans text-xs uppercase tracking-wide text-muted">
              <span className="h-px flex-1 bg-[#d3d1c8] dark:bg-line-dark" />
              {t("shabbat.orDirect")}
              <span className="h-px flex-1 bg-[#d3d1c8] dark:bg-line-dark" />
            </div>

            <label htmlFor="s-direct" className="mb-1 block font-sans text-xs font-bold text-[#46555b]">{t("shabbat.zipOrCode")}</label>
            <div className="flex gap-2">
              <input id="s-direct" value={directLocation} onChange={(e) => setDirectLocation(e.target.value)} placeholder="10001 or IL-Jerusalem" className="w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark" />
              <button type="submit" className="flex-none rounded-lg border border-[#bfc5c0] bg-white px-4 py-2.5 font-sans text-sm font-bold text-ink hover:bg-warm dark:border-line-dark dark:bg-warm-dark dark:text-ink-dark">{t("shabbat.update")}</button>
            </div>
            <p className="mt-2 font-sans text-xs leading-relaxed text-muted">{t("shabbat.fieldHelp")}</p>
          </form>
        </div>

        {/* Shabbat card */}
        <div className="bg-[#fffefb] p-8 dark:bg-warm-dark" aria-live="polite" aria-busy={loading}>
          <div className="flex items-center justify-between gap-4">
            <p className="m-0 text-xs font-bold uppercase tracking-[0.13em] text-orange">{t("shabbat.coming")}</p>
            <span className="font-sans text-sm text-muted">{view?.endsLabel}</span>
          </div>

          {loading ? (
            <div className="py-14 text-muted">{t("shabbat.loading")}</div>
          ) : error ? (
            <div>
              <p className="my-6 text-2xl tracking-tight">{t("shabbat.error")}</p>
              <p className="text-sm text-muted">{error}</p>
            </div>
          ) : view ? (
            <div>
              <p className="my-6 text-2xl tracking-tight md:text-3xl">{view.parashat}</p>
              <div className="grid grid-cols-2 gap-5">
                <div className="grid grid-cols-[28px_1fr] items-center gap-2">
                  <span className="row-span-2 text-2xl text-orange" aria-hidden="true">◒</span>
                  <span className="self-end text-xs font-bold uppercase tracking-[0.13em] text-muted">{t("shabbat.candleLighting")}</span>
                  <strong className="col-start-2 text-2xl font-normal">{view.candleTime}</strong>
                </div>
                <div className="grid grid-cols-[28px_1fr] items-center gap-2">
                  <span className="row-span-2 text-2xl text-[#6c8b8e]" aria-hidden="true">✦</span>
                  <span className="self-end text-xs font-bold uppercase tracking-[0.13em] text-muted">{t("shabbat.havdalah")}</span>
                  <strong className="col-start-2 text-2xl font-normal">{view.havdalahTime}</strong>
                </div>
              </div>
              <p className="mt-6 border-t border-line pt-4 text-sm leading-relaxed text-muted dark:border-line-dark">
                {view.degraded ? `${view.note} ${t("shabbat.degradedNote")}` : view.note}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
