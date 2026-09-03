import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import type { WeeklyEvent, WeeklyView } from "../../domain/weeklyView";

const CATEGORY_COLORS: Record<string, string> = {
  holiday: "text-orange-dark bg-orange/10",
  specialShabbat: "text-night bg-night/5 dark:bg-night/10",
  roshChodesh: "text-sage bg-sage/10",
  fast: "text-[#8c4741] bg-[#8c4741]/10",
  omer: "text-yellow bg-yellow/10",
  parashat: "text-orange-dark bg-orange/5",
  dailyLearning: "text-muted bg-warm dark:bg-warm-dark",
};

export function WeeklyPanel() {
  const { t } = useTranslation();
  const { calendar } = useApp();
  const [view, setView] = useState<WeeklyView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!calendar.getWeeklyEvents) return;
    setLoading(true);
    setError(null);
    calendar
      .getWeeklyEvents()
      .then(setView)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [calendar]);

  return (
    <section id="weekly" className="mx-auto max-w-6xl py-24" aria-labelledby="weekly-title">
      <div className="flex items-end justify-between gap-8 pb-8">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.13em] text-orange">{t("weekly.eyebrow")}</p>
          <h2 id="weekly-title" className="mt-1 text-3xl font-medium leading-none tracking-tight md:text-4xl lg:text-5xl">{t("weekly.title")}</h2>
        </div>
        <p className="max-w-[330px] text-sm leading-relaxed text-muted">{t("weekly.subtitle")}</p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-8 dark:border-line-dark dark:bg-warm-dark">
        {loading ? (
          <div className="py-12 text-muted">{t("a11y.loading")}</div>
        ) : error ? (
          <div className="py-12 text-sm text-[#9e3029]">{error}</div>
        ) : view ? (
          <>
            {/* Parashat highlight */}
            <div className="mb-6 rounded-xl bg-night px-6 py-4 text-white">
              <span className="text-xs uppercase tracking-widest text-white/40">{t("calendar.parashat")}</span>
              <div className="mt-1 text-2xl font-medium">{view.parashat}</div>
            </div>

            {/* Events list */}
            {view.events.length === 0 ? (
              <p className="py-8 text-center text-muted">{t("weekly.noEvents")}</p>
            ) : (
              <div className="grid gap-3">
                {view.events.map((event, i) => (
                  <WeeklyEventRow key={i} event={event} t={t} />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

function WeeklyEventRow({ event, t }: { event: WeeklyEvent; t: (key: string) => string }) {
  const colorClass = CATEGORY_COLORS[event.category] || "text-muted bg-warm";
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(event.date + "T12:00:00"));

  return (
    <div className="flex items-center gap-4 rounded-lg border border-line p-4 dark:border-line-dark">
      <div className="flex-none text-sm text-muted font-sans w-24">{formattedDate}</div>
      <div className={`flex-none rounded-full px-3 py-1 text-xs font-bold ${colorClass}`}>
        {event.category === "specialShabbat" ? t("weekly.specialShabbat") : event.category}
      </div>
      <div className="flex-1">
        <div className="font-medium">{event.title}</div>
        <div className="text-xs text-muted font-sans">{event.hebrewDate}</div>
      </div>
    </div>
  );
}
