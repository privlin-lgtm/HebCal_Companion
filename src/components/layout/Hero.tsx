import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { formatGregorian } from "../../domain/dates";
import type { ConvertResult } from "../../application/ports";

export function Hero() {
  const { t } = useTranslation();
  const { convertService } = useApp();
  const [hebrewDate, setHebrewDate] = useState<ConvertResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Use local conversion (offline-first) and account for after-sunset
    const now = new Date();
    const afterSunset = now.getHours() >= 18; // Simple heuristic
    convertService
      .todayHebrew(now, afterSunset)
      .then(setHebrewDate)
      .catch(() => setError(true));
  }, [convertService]);

  return (
    <section
      id="top"
      className="min-h-[510px] px-8 pb-20 pt-21 text-white"
      style={{
        background:
          "radial-gradient(circle at 78% 28%, rgba(243, 185, 83, .28), transparent 24%), radial-gradient(circle at 69% 80%, rgba(103, 151, 142, .25), transparent 28%), linear-gradient(112deg, #19363a, #31555a)",
      }}
      aria-labelledby="hero-title"
    >
      <p className="m-0 text-xs font-bold uppercase tracking-[0.13em] text-[#f4c979]">{t("hero.eyebrow")}</p>
      <h1 id="hero-title" className="mt-2 mb-4 max-w-[700px] text-5xl font-medium leading-[0.94] tracking-tight md:text-6xl lg:text-7xl">
        {t("hero.title1")}<br />{t("hero.title2")}
      </h1>
      <p className="max-w-[460px] text-lg leading-relaxed text-white/80">{t("hero.copy")}</p>
      <div className="mt-8 flex w-fit items-center gap-3 rounded-xl border border-white/20 bg-[#10292980] p-3.5 backdrop-blur-sm">
        <span className="text-2xl text-yellow" aria-hidden="true">☀</span>
        <div aria-live="polite">
          <span className="block text-xs font-bold uppercase tracking-[0.13em] text-[#e6c380]">{t("hero.today")}</span>
          {error ? (
            <strong className="block">{t("hero.todayUnavailable")}</strong>
          ) : hebrewDate ? (
            <>
              <strong className="block">{hebrewDate.hebrew}</strong>
              <span className="mt-0.5 block text-sm text-white/75">{formatGregorian(hebrewDate.gy, hebrewDate.gm, hebrewDate.gd)}</span>
            </>
          ) : (
            <strong className="block">{t("hero.todayLoading")}</strong>
          )}
        </div>
      </div>
    </section>
  );
}
