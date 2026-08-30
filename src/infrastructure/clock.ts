import { isoDate } from "../domain/dates";
import type { Clock } from "../application/ports";

/** Clock port implementation. */
export function createClock({ now = () => new Date() }: { now?: () => Date } = {}): Clock {
  return {
    now,
    todayIso: () => isoDate(now()),
  };
}
