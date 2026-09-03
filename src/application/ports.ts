/** Application ports (dependency contracts) and shared domain shapes. */

import type { Location, SavedLocation, CoordinatesLocation } from "../domain/location";
import type { Remembrance, RemembranceType } from "../domain/remembrance";
import type { ConvertParams, ConvertResult, ShabbatPayload, ShabbatView, ShabbatItem } from "../domain/calendar";
import type { ZmanimView } from "../domain/zmanim";
import type { LearningView } from "../domain/learning";
import type { MonthData } from "../domain/calendarView";
import type { WeeklyView } from "../domain/weeklyView";

export type { Location, SavedLocation, CoordinatesLocation } from "../domain/location";
export type { Remembrance, RemembranceType } from "../domain/remembrance";
export type { ConvertParams, ConvertResult, ShabbatPayload, ShabbatView, ShabbatItem } from "../domain/calendar";
export type { ZmanimView } from "../domain/zmanim";
export type { LearningView } from "../domain/learning";
export type { MonthData, CalendarDay } from "../domain/calendarView";
export type { WeeklyView, WeeklyEvent } from "../domain/weeklyView";

export type RequestOptions = { signal?: AbortSignal };

export type CalendarPort = {
  convert(params: ConvertParams, options?: RequestOptions): Promise<ConvertResult>;
  getShabbat(location: Location, options?: RequestOptions): Promise<ShabbatPayload>;
  getZmanim?(location: Location, date?: string, options?: RequestOptions): Promise<ZmanimView>;
  getLearning?(date?: string, options?: RequestOptions): Promise<LearningView>;
  getMonthData?(hebrewYear: number, hebrewMonth: number, options?: RequestOptions): Promise<MonthData>;
  getWeeklyEvents?(options?: RequestOptions): Promise<WeeklyView>;
  convertLocal?(params: ConvertParams): Promise<ConvertResult>;
  getHebrewDate?(date: Date, afterSunset?: boolean): Promise<ConvertResult>;
};

export type GeocoderPort = {
  searchCity(city: string, country: string, options?: RequestOptions): Promise<{ name: string; location: Location }>;
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

export type MultiLocationStore = {
  list(): SavedLocation[];
  add(name: string, location: Location): SavedLocation;
  remove(id: string): SavedLocation[];
  setDefault(id: string): SavedLocation[];
  getDefault(): SavedLocation | null;
};

export type IdGenerator = { next(): string };
export type Clock = { now(): Date; todayIso(): string };
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export type SyncUser = { id: string; email: string | null };

export type SyncPort = {
  /** False when the build has no Supabase credentials, so the UI can hide sync entirely. */
  isConfigured(): boolean;
  signIn(email: string, password: string): Promise<SyncUser>;
  /** `needsConfirmation` is true when Supabase requires the user to verify their email first. */
  signUp(email: string, password: string): Promise<{ user: SyncUser | null; needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  getUser(): Promise<SyncUser | null>;
  onAuthChange(listener: (user: SyncUser | null) => void): () => void;
  /** Derives the data key from the passphrase and holds it in memory for this session only. */
  unlock(passphrase: string): void;
  lock(): void;
  isUnlocked(): boolean;
  push(remembrances: Remembrance[]): Promise<void>;
  pull(): Promise<Remembrance[] | null>;
  getLastSync(): string | null;
};

export type NotificationPort = {
  isSupported(): boolean;
  requestPermission(): Promise<boolean>;
  schedule(title: string, body: string, at: Date): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
};

export type Theme = "light" | "dark" | "system";
export type ThemeStore = { get(): Theme; set(theme: Theme): void; resolved(): "light" | "dark" };