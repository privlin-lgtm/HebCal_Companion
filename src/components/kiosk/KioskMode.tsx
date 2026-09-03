import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { useLocation } from "../../context/LocationContext";
import { isKioskMode, exitKioskMode } from "../../infrastructure/capacitorBridge";
import { formatGregorian, clockFromInstant } from "../../domain/dates";
import type { ShabbatView, ConvertResult } from "../../application/ports";
import type { ZmanEntry } from "../../domain/zmanim";
import { sortZmanim } from "../../domain/zmanim";

export function KioskMode() {
  const { t } = useTranslation();
  const { convertService, shabbatService, calendar } = useApp();
  const { location, name } = useLocation();
  const [now, setNow] = useState(new Date());
  const [hebrewDate, setHebrewDate] = useState<ConvertResult | null>(null);
  const [shabbat, setShabbat] = useState<ShabbatView | null>(null);
  const [zmanim, setZmanim] = useState<ZmanEntry[]>([]);
  const [exitProgress, setExitProgress] = useState(0);
  const [holdTimer, setHoldTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load Hebrew date
  useEffect(() => {
    const afterSunset = now.getHours() >= 18;
    convertService.todayHebrew(now, afterSunset).then(setHebrewDate).catch(() => {});
  }, [convertService, now.getDate()]);

  // Load Shabbat times
  useEffect(() => {
    shabbatService.load(location, name).then(setShabbat).catch(() => {});
  }, [shabbatService, location, name]);

  // Load zmanim
  useEffect(() => {
    if (calendar.getZmanim) {
      calendar.getZmanim(location).then((v) => setZmanim(sortZmanim(v.zmanim))).catch(() => {});
    }
  }, [calendar, location]);

  // Exit on tap-and-hold (3 seconds)
  const handlePointerDown = useCallback(() => {
    setExitProgress(1);
    const timer = setTimeout(() => {
      exitKioskMode();
      window.location.search = "";
    }, 3000);
    setHoldTimer(timer);
  }, []);

  const handlePointerUp = useCallback(() => {
    setExitProgress(0);
    if (holdTimer) {
      clearTimeout(holdTimer);
      setHoldTimer(null);
    }
  }, [holdTimer]);

  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const sortedZmanim = sortZmanim(zmanim);
  const nextZmanim = sortedZmanim.find((z) => z.iso && new Date(z.iso) > now);
  const prevZmanim = [...sortedZmanim].reverse().find((z) => z.iso && new Date(z.iso) <= now);

  return (
    <div
      className="kiosk-mode fixed inset-0 flex flex-col items-center justify-center bg-night text-white"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Exit progress bar */}
      {exitProgress > 0 && (
        <div className="fixed top-0 left-0 h-1 bg-orange transition-all duration-3000" style={{ width: "100%" }} />
      )}

      {/* Main display */}
      <div className="flex flex-col items-center gap-8 px-8">
        {/* Time */}
        <div className="text-7xl font-light tabular-nums md:text-8xl lg:text-9xl">{timeStr}</div>

        {/* Hebrew date */}
        {hebrewDate && (
          <div className="text-center">
            <div className="text-3xl font-medium md:text-4xl lg:text-5xl">{hebrewDate.hebrew}</div>
            <div className="mt-2 text-lg text-white/60 md:text-xl">
              {formatGregorian(hebrewDate.gy, hebrewDate.gm, hebrewDate.gd)}
            </div>
          </div>
        )}

        {/* Location */}
        <div className="text-sm uppercase tracking-widest text-white/40">{name}</div>

        {/* Shabbat times */}
        {shabbat && (
          <div className="flex gap-12 rounded-2xl border border-white/10 bg-white/5 px-10 py-6">
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-white/40">{t("shabbat.candleLighting")}</div>
              <div className="mt-2 text-3xl font-light text-yellow">{shabbat.candleTime}</div>
            </div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-white/40">{t("shabbat.parashat")}</div>
              <div className="mt-2 text-2xl font-light">{shabbat.parashat}</div>
            </div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-white/40">{t("shabbat.havdalah")}</div>
              <div className="mt-2 text-3xl font-light text-[#6c8b8e]">{shabbat.havdalahTime}</div>
            </div>
          </div>
        )}

        {/* Next zman */}
        {nextZmanim && prevZmanim && (
          <div className="flex gap-8 text-sm">
            <div className="text-white/50">
              <span className="uppercase tracking-widest">{t(prevZmanim.labelKey)}: </span>
              <span className="text-white/70">{prevZmanim.time}</span>
            </div>
            <div className="text-white/50">
              <span className="uppercase tracking-widest">{t(nextZmanim.labelKey)}: </span>
              <span className="text-yellow">{nextZmanim.time}</span>
            </div>
          </div>
        )}
      </div>

      {/* Exit hint */}
      <div className="fixed bottom-4 text-xs text-white/20">{t("kiosk.tapToExit")}</div>
    </div>
  );
}

/** Check if kiosk mode is active and render KioskMode instead of the normal app. */
export function useKioskMode(): boolean {
  const [kiosk, setKiosk] = useState(false);
  useEffect(() => {
    setKiosk(isKioskMode());
  }, []);
  return kiosk;
}
