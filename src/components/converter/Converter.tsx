import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { HEBREW_MONTHS } from "../../domain/remembrance";
import { isoDate, formatGregorian } from "../../domain/dates";
import type { ConvertResult } from "../../application/ports";
import { useToast } from "../../hooks/useToast";

export function Converter() {
  const { t } = useTranslation();
  const { convertService } = useApp();
  const { showToast } = useToast();
  const [tab, setTab] = useState<"g2h" | "h2g">("g2h");
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [gregorianDate, setGregorianDate] = useState(isoDate());
  const [afterSunset, setAfterSunset] = useState(false);
  const [hebrewDay, setHebrewDay] = useState(1);
  const [hebrewYear, setHebrewYear] = useState(5787);
  const [hebrewMonth, setHebrewMonth] = useState<string>("Tishrei");

  async function handleGregorianSubmit(e: FormEvent) {
    e.preventDefault();
    if (!gregorianDate) return;
    const [gy, gm, gd] = gregorianDate.split("-").map(Number);
    setLoading(true);
    try {
      const data = await convertService.gregorianToHebrew({ gy, gm, gd, afterSunset });
      setResult(data);
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  async function handleHebrewSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await convertService.hebrewToGregorian({ hy: hebrewYear, hm: hebrewMonth, hd: hebrewDay });
      setResult(data);
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="converter" className="mx-auto max-w-6xl px-0 py-24" aria-labelledby="converter-title">
      <div className="flex items-end justify-between gap-8 pb-8">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.13em] text-orange">{t("converter.eyebrow")}</p>
          <h2 id="converter-title" className="mt-1 text-3xl font-medium leading-none tracking-tight md:text-4xl lg:text-5xl">{t("converter.title")}</h2>
        </div>
        <p className="max-w-[330px] text-sm leading-relaxed text-muted">{t("converter.subtitle")}</p>
      </div>

      <div className="grid min-h-[385px] grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-lg md:grid-cols-[1.05fr_0.95fr] dark:bg-warm-dark">
        {/* Input panel */}
        <div className="border-b border-line p-8 md:border-b-0 md:border-e md:border-line dark:border-line-dark">
          <div className="mb-8 inline-flex rounded-lg bg-warm p-0.5 dark:bg-warm-dark" role="tablist" aria-label={t("a11y.conversionDirection")}>
            <button
              role="tab"
              aria-selected={tab === "g2h"}
              tabIndex={tab === "g2h" ? 0 : -1}
              onClick={() => setTab("g2h")}
              className={`rounded-md px-3 py-2 text-sm ${tab === "g2h" ? "bg-white font-bold text-ink shadow dark:bg-warm-dark dark:text-ink-dark" : "text-muted"}`}
            >
              {t("converter.tabG2H")}
            </button>
            <button
              role="tab"
              aria-selected={tab === "h2g"}
              tabIndex={tab === "h2g" ? 0 : -1}
              onClick={() => setTab("h2g")}
              className={`rounded-md px-3 py-2 text-sm ${tab === "h2g" ? "bg-white font-bold text-ink shadow dark:bg-warm-dark dark:text-ink-dark" : "text-muted"}`}
            >
              {t("converter.tabH2G")}
            </button>
          </div>

          {tab === "g2h" ? (
            <form onSubmit={handleGregorianSubmit}>
              <label htmlFor="greg-date" className="mb-2 block font-sans text-xs font-bold text-[#46555b]">{t("converter.gregorianDate")}</label>
              <input id="greg-date" type="date" required value={gregorianDate} onChange={(e) => setGregorianDate(e.target.value)} className="w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark" />
              <label className="mt-4 mb-6 flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={afterSunset} onChange={(e) => setAfterSunset(e.target.checked)} className="sr-only" />
                <span className={`relative flex h-5 w-9 rounded-full transition ${afterSunset ? "bg-orange" : "bg-[#c7c9c4]"}`}>
                  <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${afterSunset ? "translate-x-4" : "translate-x-0.5"}`} />
                </span>
                <span>
                  <strong className="block font-serif text-sm text-ink dark:text-ink-dark">{t("converter.afterSunset")}</strong>
                  <small className="mt-0.5 block font-sans text-xs text-muted">{t("converter.afterSunsetDesc")}</small>
                </span>
              </label>
              <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2.5 font-sans text-sm font-bold text-white hover:bg-orange-dark disabled:opacity-50">
                {t("converter.convert")} →
              </button>
            </form>
          ) : (
            <form onSubmit={handleHebrewSubmit}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="h-day" className="mb-2 block font-sans text-xs font-bold text-[#46555b]">{t("converter.day")}</label>
                  <input id="h-day" type="number" min={1} max={30} value={hebrewDay} onChange={(e) => setHebrewDay(Number(e.target.value))} required className="w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark" />
                </div>
                <div>
                  <label htmlFor="h-year" className="mb-2 block font-sans text-xs font-bold text-[#46555b]">{t("converter.year")}</label>
                  <input id="h-year" type="number" min={1} value={hebrewYear} onChange={(e) => setHebrewYear(Number(e.target.value))} required className="w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark" />
                </div>
              </div>
              <label htmlFor="h-month" className="mb-2 mt-4 block font-sans text-xs font-bold text-[#46555b]">{t("converter.hebrewMonth")}</label>
              <select id="h-month" value={hebrewMonth} onChange={(e) => setHebrewMonth(e.target.value)} className="mb-6 w-full rounded-lg border border-[#cbc9bf] bg-[#fffefc] p-3 dark:border-line-dark dark:bg-warm-dark">
                {HEBREW_MONTHS.map((m) => <option key={m} value={m}>{t(`months.${m}`)}</option>)}
              </select>
              <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2.5 font-sans text-sm font-bold text-white hover:bg-orange-dark disabled:opacity-50">
                {t("converter.convert")} →
              </button>
            </form>
          )}
        </div>

        {/* Result panel */}
        <aside className="grid content-center bg-night p-10 text-white" aria-live="polite" aria-atomic="true">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.13em] text-[#e9c879]">{t("converter.resultEyebrow")}</p>
          {result ? (
            <div>
              <p className="m-0 font-sans text-sm font-bold uppercase tracking-wide text-[#f9dc96]">{formatGregorian(result.gy, result.gm, result.gd)}</p>
              <p className="my-2 text-3xl leading-tight md:text-4xl">{result.hebrew} · {result.hy} {result.hm} {result.hd}</p>
              {result.events && result.events.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.events.map((event, i) => <span key={i} className="rounded border border-white/25 px-2 py-1 font-sans text-xs text-[#dbe5de]">{event}</span>)}
                </div>
              )}
            </div>
          ) : (
            <div className="text-white/75">
              <span className="block text-2xl text-yellow">{t("converter.resultEmptySymbol")}</span>
              <h3 className="mt-2 mb-1 text-xl font-normal text-white">{t("converter.resultEmptyTitle")}</h3>
              <p className="max-w-[260px] text-sm leading-relaxed">{t("converter.resultEmptyDesc")}</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
