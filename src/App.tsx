import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { createServices } from "./composition";
import { AppProvider } from "./context/AppContext";
import { LocationProvider } from "./context/LocationContext";
import { applyLanguage } from "./i18n/config";
import { Header } from "./components/layout/Header";
import { Hero } from "./components/layout/Hero";
import { AboutStrip } from "./components/layout/AboutStrip";
import { ToastContainer } from "./components/layout/ToastContainer";
import { Converter } from "./components/converter/Converter";
import { Shabbat } from "./components/shabbat/Shabbat";
import { Remembrances } from "./components/remembrances/Remembrances";
import { CalendarView } from "./components/calendar/CalendarView";
import { Zmanim } from "./components/zmanim/Zmanim";
import { WeeklyPanel } from "./components/weekly/WeeklyPanel";
import { KioskMode, useKioskMode } from "./components/kiosk/KioskMode";

export function App() {
  const services = useMemo(() => createServices(), []);
  const { i18n } = useTranslation();
  const isKiosk = useKioskMode();

  useMemo(() => {
    applyLanguage(i18n.language === "he" ? "he" : "en");
  }, [i18n.language]);

  if (isKiosk) {
    return (
      <AppProvider services={services}>
        <LocationProvider>
          <KioskMode />
        </LocationProvider>
      </AppProvider>
    );
  }

  return (
    <AppProvider services={services}>
      <LocationProvider>
        <a href="#main-content" className="skip-link fixed -top-16 left-4 z-10 bg-night px-4 py-2.5 text-white focus-visible:top-4">
          {i18n.t("a11y.skipToContent")}
        </a>
        <Header />
        <main id="main-content">
          <Hero />
          <Converter />
          <Shabbat />
          <CalendarView />
          <Zmanim />
          <Remembrances />
          <AboutStrip />
        </main>
        <ToastContainer />
      </LocationProvider>
    </AppProvider>
  );
}