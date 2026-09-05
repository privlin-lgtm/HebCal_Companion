import { useEffect, useMemo, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { createServices } from "./composition";
import { AppProvider } from "./context/AppContext";
import { LocationProvider } from "./context/LocationContext";
import { ToastProvider } from "./context/ToastContext";
import { applyLanguage } from "./i18n/config";
import { Header } from "./components/layout/Header";
import { Hero } from "./components/layout/Hero";
import { AboutStrip } from "./components/layout/AboutStrip";
import { ToastContainer } from "./components/layout/ToastContainer";
import { Converter } from "./components/converter/Converter";
import { Shabbat } from "./components/shabbat/Shabbat";
import { Remembrances } from "./components/remembrances/Remembrances";
import { KioskMode, useKioskMode } from "./components/kiosk/KioskMode";
import { ErrorBoundary } from "./components/ErrorBoundary";

const CalendarView = lazy(() => import("./components/calendar/CalendarView").then(m => ({ default: m.CalendarView })));
const Zmanim = lazy(() => import("./components/zmanim/Zmanim").then(m => ({ default: m.Zmanim })));
const WeeklyPanel = lazy(() => import("./components/weekly/WeeklyPanel").then(m => ({ default: m.WeeklyPanel })));
const LearningPanel = lazy(() => import("./components/learning/LearningPanel").then(m => ({ default: m.LearningPanel })));

export function App() {
  const services = useMemo(() => createServices(), []);
  const { i18n } = useTranslation();
  const isKiosk = useKioskMode();

  useEffect(() => {
    applyLanguage(i18n.language === "he" ? "he" : "en");
  }, [i18n.language]);

  // Start the automatic sync coordinator (online/visibility/focus triggers and
  // a visible-only timer) and tear down its listeners/timers on unmount. The
  // coordinator self-disables when Supabase is not configured, so this is safe
  // to run in every build.
  useEffect(() => services.syncCoordinator.start(), [services]);

  if (isKiosk) {
    return (
      <AppProvider services={services}>
        <LocationProvider>
          <ToastProvider>
            <KioskMode />
            <ToastContainer />
          </ToastProvider>
        </LocationProvider>
      </AppProvider>
    );
  }

  return (
    <AppProvider services={services}>
      <LocationProvider>
        <ToastProvider>
          <a href="#main-content" className="skip-link fixed -top-16 left-4 z-10 bg-night px-4 py-2.5 text-white focus-visible:top-4">
            {i18n.t("a11y.skipToContent")}
          </a>
          <Header />
          <main id="main-content">
            <Hero />
            <ErrorBoundary><Converter /></ErrorBoundary>
            <ErrorBoundary><Shabbat /></ErrorBoundary>
            <ErrorBoundary><Suspense fallback={<div className="py-12 text-center text-sm text-muted">Loading…</div>}><CalendarView /></Suspense></ErrorBoundary>
            <ErrorBoundary><Suspense fallback={<div className="py-12 text-center text-sm text-muted">Loading…</div>}><Zmanim /></Suspense></ErrorBoundary>
            <ErrorBoundary><Remembrances /></ErrorBoundary>
            <ErrorBoundary><Suspense fallback={<div className="py-12 text-center text-sm text-muted">Loading…</div>}><WeeklyPanel /></Suspense></ErrorBoundary>
            <ErrorBoundary><Suspense fallback={null}><LearningPanel /></Suspense></ErrorBoundary>
            <AboutStrip />
          </main>
          <ToastContainer />
        </ToastProvider>
      </LocationProvider>
    </AppProvider>
  );
}