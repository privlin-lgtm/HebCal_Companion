/** Zmanim (halachic times) domain types — no I/O. */

export type ZmanKey =
  | "alotHashachar"
  | "misheyakir"
  | "sunrise"
  | "sofZmanShma"
  | "sofZmanTfilla"
  | "chatzot"
  | "minchaGedola"
  | "minchaKetana"
  | "plagHamincha"
  | "sunset"
  | "tzeitHakochavim";

export type ZmanEntry = {
  key: ZmanKey;
  labelKey: string;
  time: string; // formatted time string
  iso?: string; // ISO timestamp for sorting/comparison
};

export type ZmanimView = {
  date: string;
  locationName: string;
  zmanim: ZmanEntry[];
  degraded?: boolean;
};

/** Order for display. */
export const ZMAN_ORDER: ZmanKey[] = [
  "alotHashachar",
  "misheyakir",
  "sunrise",
  "sofZmanShma",
  "sofZmanTfilla",
  "chatzot",
  "minchaGedola",
  "minchaKetana",
  "plagHamincha",
  "sunset",
  "tzeitHakochavim",
];

export function sortZmanim(zmanim: ZmanEntry[]): ZmanEntry[] {
  const order = new Map(ZMAN_ORDER.map((key, index) => [key, index]));
  return [...zmanim].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
}
