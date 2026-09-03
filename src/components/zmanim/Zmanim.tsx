import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import { useLocation } from "../../context/LocationContext";
import { sortZmanim, type ZmanEntry } from "../../domain/zmanim";

export function Zmanim() {
  const { t } = useTranslation();
  const { calendar } = useApp();
  const { location, name } = useLocation();
  const [zmanim, setZmanim] = useState<ZmanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!calendar.getZmanim) return;
    setLoading(true);
    setError(null);
    calendar
      .getZmanim(location)
      .then((view) => setZmanim(sortZmanim(view.zmanim)))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [calendar, location]);

  return (
    <section id="zmanim" className="mx-auto max-w-6xl py-24" aria-labelledby="zmanim-title">
      <div className="flex items-end justify-between gap-8 pb-8">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.13em] text-orange">{t("zmanim.eyebrow")}</p>
          <h2 id="zmanim-title" className="mt-1 text-3xl font-medium leading-none tracking-tight md:text-4xl lg:text-5xl">{t("zmanim.title")}</h2>
        </div>
        <p className="max-w-[330px] text-sm leading-relaxed text-muted">{t("zmanim.subtitle")}</p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-8 dark:border-line-dark dark:bg-warm-dark">
        <p className="mb-6 text-sm text-muted">{name}</p>

        {loading ? (
          <div className="py-12 text-muted">{t("a11y.loading")}</div>
        ) : error ? (
          <div className="py-12 text-sm text-[#9e3029]">{error}</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {zmanim.map((zman) => (
              <div key={zman.key} className="flex items-center justify-between rounded-lg border border-line px-4 py-3 dark:border-line-dark">
                <span className="font-sans text-sm text-muted">{t(zman.labelKey)}</span>
                <strong className="font-sans text-lg font-normal text-ink dark:text-ink-dark">{zman.time}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
