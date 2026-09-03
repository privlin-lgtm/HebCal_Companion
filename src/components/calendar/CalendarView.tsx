import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HDate, greg } from "@hebcal/core";
import { useApp } from "../../context/AppContext";
import { WEEKDAY_LABELS_EN, type CalendarDay, type MonthData } from "../../domain/calendarView";

const HEBREW_MONTHS_ORDER = [
  "Tishrei", "Cheshvan", "Kislev", "Tevet", "Sh'vat",
  "Adar", "Adar I", "Adar II",
  "Nisan", "Iyyar", "Sivan", "Tamuz", "Av", "Elul",
];

export function CalendarView() {
  const { t, i18n } = useTranslation();
  const { calendar } = useApp();
  const [data, setData] = useState<MonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hebrewYear, setHebrewYear] = useState(5787);
  const [hebrewMonth, setHebrewMonth] = useState(1);

  useEffect(() => {
    if (!calendar.getMonthData) return;
    setLoading(true);
    setError(null);
    calendar.getMonthData(hebrewYear, hebrewMonth)
      .then(setData)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [calendar, hebrewYear, hebrewMonth]);

  function prevMonth() {
    let m = hebrewMonth - 1;
    let y = hebrewYear;
    if (m < 1) { m = HEBREW_MONTHS_ORDER.length; y -= 1; }
    setHebrewMonth(m);
    setHebrewYear(y);
  }

  function nextMonth() {
    let m = hebrewMonth + 1;
    let y = hebrewYear;
    if (m > HEBREW_MONTHS_ORDER.length) { m = 1; y += 1; }
    setHebrewMonth(m);
    setHebrewYear(y);
  }

  function goToday() {
    const now = new Date();
    const abs = greg.greg2abs(now);
    const hd = new HDate(abs);
    setHebrewYear(hd.getFullYear());
    const monthName = hd.getMonthName();
    const idx = HEBREW_MONTHS_ORDER.indexOf(monthName);
    setHebrewMonth(idx >= 0 ? idx + 1 : 1);
  }

  const isHebrew = i18n.language === "he";
  const weekdayLabels = isHebrew ? ["א", "ב", "ג", "ד", "ה", "ו", "ש"] : WEEKDAY_LABELS_EN;

  return (
    <section id="calendar" className="mx-auto max-w-6xl py-24" aria-labelledby="calendar-title">
      <div className="flex items-end justify-between gap-8 pb-8">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.13em] text-orange">{t("calendar.eyebrow")}</p>
          <h2 id="calendar-title" className="mt-1 text-3xl font-medium leading-none tracking-tight md:text-4xl lg:text-5xl">{t("calendar.title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-warm dark:border-line-dark dark:bg-warm-dark" aria-label={t("calendar.prev")}>←</button>
          <button onClick={goToday} className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-bold hover:bg-warm dark:border-line-dark dark:bg-warm-dark">{t("calendar.today")}</button>
          <button onClick={nextMonth} className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-warm dark:border-line-dark dark:bg-warm-dark" aria-label={t("calendar.next")}>→</button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6 dark:border-line-dark dark:bg-warm-dark">
        {loading ? (
          <div className="py-16 text-center text-muted">{t("a11y.loading")}</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-[#9e3029]">{error}</div>
        ) : data ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-medium tracking-tight">{t(`months.${data.hebrewMonthName}`)} {data.hebrewYear}</h3>
              <span className="text-sm text-muted">{data.gregorianMonthName}</span>
            </div>
            <div className="grid grid-cols-7 gap-1 border-b border-line pb-2 mb-2 dark:border-line-dark">
              {weekdayLabels.map((label) => (
                <div key={label} className="py-1 text-center font-sans text-xs font-bold text-muted">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {data.grid.map((day, i) => <CalendarCell key={i} day={day} t={t} />)}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function CalendarCell({ day, t }: { day: CalendarDay | null; t: (key: string) => string }) {
  if (!day) return <div className="min-h-[80px] rounded-lg" />;
  const hasHolidays = day.holidays.length > 0;
  return (
    <div className={[
      "min-h-[80px] rounded-lg border p-2 text-sm",
      day.isToday ? "border-orange bg-orange/10" : "border-line dark:border-line-dark",
      day.isShabbat && !day.isToday ? "bg-night/5 dark:bg-night/10" : "",
      hasHolidays ? "bg-yellow/10" : "",
    ].join(" ")}>
      <div className="flex items-start justify-between">
        <span className={`font-sans font-bold ${day.isShabbat ? "text-orange-dark" : "text-ink dark:text-ink-dark"}`}>{day.hebrewDay}</span>
        <span className="font-sans text-xs text-muted">{day.gregorian.day}</span>
      </div>
      {hasHolidays && (
        <div className="mt-1 space-y-0.5">
          {day.holidays.map((h, i) => <div key={i} className="font-sans text-xs leading-tight text-orange-dark">{h}</div>)}
        </div>
      )}
      {day.parashat && <div className="mt-1 font-sans text-xs leading-tight text-muted">{day.parashat}</div>}
    </div>
  );
}