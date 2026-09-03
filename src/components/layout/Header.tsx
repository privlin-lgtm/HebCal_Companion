import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { useTheme } from "../../hooks/useTheme";
import { applyLanguage, type Language } from "../../i18n/config";
import { cn } from "../../lib/utils";

export function Header() {
  const { t, i18n } = useTranslation();
  const { themeStore } = useApp();
  const { resolved, toggle } = useTheme(themeStore);

  const switchLanguage = () => {
    const newLang: Language = i18n.language === "he" ? "en" : "he";
    applyLanguage(newLang);
  };

  return (
    <header className="mx-auto flex min-h-[76px] max-w-6xl items-center justify-between px-7 py-4">
      <a href="#top" className="inline-flex items-center gap-2 text-xl font-bold tracking-tight no-underline" aria-label={t("brand.name")}>
        <span className="text-2xl text-orange" aria-hidden="true">✦</span>
        <span>{t("brand.name")}</span>
      </a>
      <nav className="flex items-center gap-6" aria-label={t("a11y.primaryNav")}>
        <a href="#converter" className="text-sm text-muted no-underline hover:text-orange-dark hover:underline">{t("nav.converter")}</a>
        <a href="#shabbat" className="text-sm text-muted no-underline hover:text-orange-dark hover:underline hidden sm:inline">{t("nav.shabbat")}</a>
        <a href="#remembrances" className="text-sm text-muted no-underline hover:text-orange-dark hover:underline">{t("nav.remembrances")}</a>
        <a href="#calendar" className="text-sm text-muted no-underline hover:text-orange-dark hover:underline hidden md:inline">{t("nav.calendar")}</a>
        <a href="#zmanim" className="text-sm text-muted no-underline hover:text-orange-dark hover:underline hidden lg:inline">{t("nav.zmanim")}</a>
        <a href="?kiosk" className="text-sm text-muted no-underline hover:text-orange-dark hover:underline hidden xl:inline">{t("nav.kiosk")}</a>

        <button
          onClick={toggle}
          className="rounded-lg border border-line bg-white p-2 text-sm hover:bg-warm dark:border-line-dark dark:bg-warm-dark"
          aria-label={resolved === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
        >
          {resolved === "dark" ? "☀" : "☾"}
        </button>

        <button
          onClick={switchLanguage}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold hover:bg-warm dark:border-line-dark dark:bg-warm-dark"
          aria-label="Switch language"
        >
          {t("nav.language")}
        </button>
      </nav>
    </header>
  );
}
