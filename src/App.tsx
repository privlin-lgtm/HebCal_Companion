import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { createServices } from "./composition";
import { AppProvider } from "./context/AppContext";
import { applyLanguage } from "./i18n/config";
import { Header } from "./components/layout/Header";
import { Hero } from "./components/layout/Hero";
import { AboutStrip } from "./components/layout/AboutStrip";
import { ToastContainer } from "./components/layout/ToastContainer";
import { Converter } from "./components/converter/Converter";
import { Shabbat } from "./components/shabbat/Shabbat";
import { Remembrances } from "./components/remembrances/Remembrances";

export function App() {
  const services = useMemo(() => createServices(), []);
  const { i18n } = useTranslation();

  // Apply initial language direction
  useMemo(() => {
    applyLanguage(i18n.language === "he" ? "he" : "en");
  }, [i18n.language]);

  return (
    <AppProvider services={services}>
      <a href="#main-content" className="skip-link fixed -top-16 left-4 z-10 bg-night px-4 py-2.5 text-white focus-visible:top-4">
        {i18n.t("a11y.skipToContent")}
      </a>
      <Header />
      <main id="main-content">
        <Hero />
        <Converter />
        <Shabbat />
        <Remembrances />
        <AboutStrip />
      </main>
      <ToastContainer />
    </AppProvider>
  );
}
