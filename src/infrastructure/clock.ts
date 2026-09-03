import type { Clock } from "../application/ports";
import { isoDate } from "../domain/dates";

export function createClock({ now = () => new Date() }: { now?: () => Date } = {}): Clock {
  return { now, todayIso: () => isoDate(now()) };
}