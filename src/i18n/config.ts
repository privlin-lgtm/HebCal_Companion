import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import he from "./he.json";

export type Language = "en" | "he";

export const SUPPORTED_LANGUAGES: Language[] = ["en", "he"];
export const DEFAULT_LANGUAGE: Language = "en";

const stored = typeof localStorage !== "undefined" ? localStorage.getItem("or-zarua-lang") : null;
const initialLang: Language = stored === "he" || stored === "en" ? stored : DEFAULT_LANGUAGE;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng: initialLang,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes
  },
  returnNull: false,
});

export function applyLanguage(lang: Language) {
  i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  try {
    localStorage.setItem("or-zarua-lang", lang);
  } catch {
    // Storage may be unavailable (private mode, Capacitor before bridge)
  }
}

export function isRTL(lang: Language): boolean {
  return lang === "he";
}

export default i18n;
