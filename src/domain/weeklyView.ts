/** Weekly view domain types — no I/O. */

export type WeeklyEventCategory =
  | "holiday"
  | "specialShabbat"
  | "parashat"
  | "roshChodesh"
  | "fast"
  | "omer"
  | "dailyLearning";

export type WeeklyEvent = {
  date: string; // ISO date
  hebrewDate: string;
  title: string;
  category: WeeklyEventCategory;
};

export type WeeklyView = {
  events: WeeklyEvent[];
  parashat: string;
  weekStart: string;
  weekEnd: string;
};
