/** Calendar month view domain types — no I/O. */

export type CalendarDay = {
  hebrewDay: number;
  hebrewMonth: string;
  hebrewYear: number;
  gregorian: { year: number; month: number; day: number };
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  isShabbat: boolean;
  isToday: boolean;
  holidays: string[];
  parashat?: string;
  omer?: number;
};

export type MonthData = {
  hebrewMonth: string;
  hebrewYear: number;
  hebrewMonthName: string;
  gregorianMonthName: string;
  days: CalendarDay[];
  /** Grid cells with nulls for alignment (Sunday-first week). */
  grid: (CalendarDay | null)[];
};

export const WEEKDAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LABELS_HE = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
