/** Application ports (dependency contracts) and shared domain shapes. */

export type GeonameLocation = { kind: "geonameid"; id: string };
export type CoordinatesLocation = { kind: "coordinates"; lat: number; lng: number; tzid: string };
export type ZipLocation = { kind: "zip"; zip: string };
export type CityLocation = { kind: "city"; code: string };
export type Location = GeonameLocation | CoordinatesLocation | ZipLocation | CityLocation;

export type RemembranceType = "Yahrzeit" | "Anniversary";

export type Remembrance = {
  id: string;
  name: string;
  type: RemembranceType;
  hy: number;
  hm: string;
  hd: number;
  originalDate?: string | null;
  nextIso?: string | null;
  nextFormatted?: string | null;
};

export type ConvertParams = {
  gy?: number;
  gm?: number;
  gd?: number;
  hy?: number | string;
  hm?: string;
  hd?: number | string;
  g2h?: number | string;
  h2g?: number | string;
  gs?: string | number;
};

export type ConvertResult = {
  gy: number;
  gm: number;
  gd: number;
  hy: number;
  hm: string;
  hd: number;
  hebrew?: string;
  events?: string[];
};

export type ShabbatItem = {
  category: string;
  title?: string;
  date?: string;
  memo?: string;
};

export type ShabbatPayload = {
  location?: { title?: string; tzid?: string };
  range?: { start?: string; end?: string };
  items?: ShabbatItem[];
  _degraded?: boolean;
};

export type ShabbatView = {
  place: string;
  endsLabel: string;
  parashat: string;
  candleTime: string;
  havdalahTime: string;
  note: string;
  degraded?: boolean;
};

export type RequestOptions = {
  signal?: AbortSignal;
};

export type CalendarPort = {
  convert(params: ConvertParams, options?: RequestOptions): Promise<ConvertResult>;
  getShabbat(location: Location, options?: RequestOptions): Promise<ShabbatPayload>;
};

export type GeocoderPort = {
  searchCity(
    city: string,
    country: string,
    options?: RequestOptions,
  ): Promise<{ name: string; location: Location }>;
};

export type RemembranceRepository = {
  list(): Remembrance[];
  saveAll(records: Remembrance[]): Remembrance[];
  mergeUpcoming(updatesById: Map<string, Partial<Remembrance>>): Remembrance[];
};

export type LocationStore = {
  read(): { name: string; location: Location } | null;
  write(location: Location, name: string): void;
};

export type IdGenerator = {
  next(): string;
};

export type Clock = {
  now(): Date;
  todayIso(): string;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};
