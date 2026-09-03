import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../../context/AppContext";
import type { LearningEntry } from "../../domain/learning";

export function LearningPanel() {
  const { t } = useTranslation();
  const { calendar } = useApp();
  const [entries, setEntries] = useState<LearningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!calendar.getLearning) return;
    setLoading(true);
    setError(null);
    calendar
      .getLearning()
      .then((view) => setEntries(view.entries))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [calendar]);

  if (loading && entries.length === 0) return null;
  if (error || entries.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl pb-12" aria-label={t("learning.eyebrow")}>
      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => (
          <div key={entry.track} className="flex items-center gap-4 rounded-xl border border-line bg-white p-5 dark:border-line-dark dark:bg-warm-dark">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-full bg-night text-white">
              <span className="text-lg">📖</span>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted">{t(entry.labelKey)}</div>
              <div className="mt-1 text-lg font-medium">{entry.description}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
