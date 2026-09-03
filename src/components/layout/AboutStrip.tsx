import { useTranslation } from "react-i18next";

export function AboutStrip() {
  const { t } = useTranslation();
  return (
    <section className="flex items-center justify-center gap-3 bg-night px-7 py-8 text-center text-sm leading-relaxed text-[#e6eeeb]" aria-label="About">
      <span className="text-xl text-yellow" aria-hidden="true">✦</span>
      <p className="max-w-2xl">{t("about.text")}</p>
    </section>
  );
}
